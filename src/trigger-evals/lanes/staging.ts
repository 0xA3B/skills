import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  listPluginSkills,
  readSkillFileAllowImplicitInvocation,
  type Skill,
  type SkillDirectory,
} from "../../skills/index.js";
import type { MarketplacePluginEntry } from "../marketplace.js";
import type { RuntimeResources } from "../runtime.js";
import { appendEvalSectionToFile, createCanary } from "./canary.js";

export type StagedPlugin = {
  pluginName: string;
  // Committed plugin directory the staged copies were made from; the Codex plugin cache copies
  // from here again per case.
  sourcePath: string;
  version: string;
};

// One eval canary and the staged skill whose body carries it.
export type SkillCanary = {
  canary: string;
  skillLabel: string;
  // Undefined for a repo-local skill.
  pluginName?: string;
  skillName: string;
};

export type DeploymentOptions = {
  target: Skill;
  // Catalog plugins staged alongside the target's own surface; an entry for a plugin target's own
  // plugin is deduplicated.
  plugins: MarketplacePluginEntry[];
  // Sibling repo-local skills staged alongside a repo-local target, mirroring how this checkout
  // loads every repo-local skill together. Ignored for a plugin target: repo-local skills do not
  // exist where plugins install.
  repoLocalSkills: SkillDirectory[];
  // Where the agent discovers project skills: .agents/skills for Codex, .claude/skills for Claude
  // Code.
  repoLocalSurface: ".agents" | ".claude";
  // Whether staged repo-local skills carry canaries, for a lane that detects their invocation
  // through the canary or a read of the canaried file.
  canaryRepoLocalSkills: boolean;
  runtime: RuntimeResources;
};

// The target's deployment context, staged once per run and shared by its cases.
export type StagedDeployment = {
  // Temporary root holding everything below; tracked on the runtime before any fallible step.
  workspaceRoot: string;
  // The base case workspace: staged repo-local skills only. A case that mutates its workspace
  // copies this one, so the canaries it carries are already in place.
  workspacePath: string;
  // Installed plugins are deployment context, not project files, so their copies live under
  // <deploymentPath>/plugins/<plugin>, outside the case workspace, where project reconnaissance
  // sees only fixture files, as it would in a real installed session.
  deploymentPath: string;
  stagedPlugins: StagedPlugin[];
  // Every canary appended to a staged skill body, plugin skills first.
  canaries: SkillCanary[];
  // Every staged skill's label regardless of invocation policy: manual-only skills also surface
  // in loaded-skills observations, so the isolation check must expect them.
  stagedSkillLabels: ReadonlySet<string>;
  // For each staged skill, the staged skills its body names; see surveySkillDependencies.
  skillDependencies: ReadonlyMap<string, ReadonlySet<string>>;
};

// Stages the plugins and repo-local skills a target is evaluated among and appends the canaries
// that make each invocation attributable. Every staged plugin skill that is implicitly invokable
// gets a canary, so a wrong skill firing is observable instead of an undifferentiated miss;
// manual-only skills cannot fire implicitly, so they stay canary-free. The target is always
// canaried, because a --force run of a manual-only target would otherwise lose its signal.
export async function stageDeployment(options: DeploymentOptions): Promise<StagedDeployment> {
  const { target, runtime } = options;
  const workspaceRoot = runtime.track(
    await mkdtemp(path.join(os.tmpdir(), "trigger-eval-workspace-")),
  );
  const workspacePath = path.join(workspaceRoot, "workspace");
  await mkdir(workspacePath, { recursive: true });
  const deploymentPath = path.join(workspaceRoot, "deployment");

  const entries = pluginsToStage(target, options.plugins);
  const stagedPlugins = await stagePluginCopies(deploymentPath, entries);
  const labels: string[] = [];
  const skillFiles: StagedSkillFile[] = [];
  const canaries: SkillCanary[] = [];
  for (const entry of entries) {
    for (const { skillName, skillPath } of await listPluginSkills(entry.pluginPath)) {
      const skillLabel = `${entry.pluginName}:${skillName}`;
      const filePath = path.join(skillPath, "SKILL.md");
      labels.push(skillLabel);
      skillFiles.push({ skillLabel, pluginName: entry.pluginName, skillName, filePath });
      const isTarget =
        target.kind === "plugin" &&
        entry.pluginName === target.pluginName &&
        skillName === target.skillName;
      if (!isTarget && !(await readSkillFileAllowImplicitInvocation(filePath))) {
        continue;
      }
      const canary = createCanary();
      await appendEvalSectionToFile(
        path.join(deploymentPath, "plugins", entry.pluginName, "skills", skillName, "SKILL.md"),
        canary,
      );
      canaries.push({ canary, skillLabel, pluginName: entry.pluginName, skillName });
    }
  }

  if (target.kind === "repo-local") {
    for (const skill of [target, ...options.repoLocalSkills]) {
      const stagedSkillFile = await stageRepoLocalSkill(
        workspacePath,
        skill,
        options.repoLocalSurface,
      );
      labels.push(skill.skillName);
      skillFiles.push({
        skillLabel: skill.skillName,
        skillName: skill.skillName,
        filePath: path.join(skill.skillPath, "SKILL.md"),
      });
      if (
        !options.canaryRepoLocalSkills ||
        (skill.skillName !== target.skillName &&
          !(await readSkillFileAllowImplicitInvocation(stagedSkillFile)))
      ) {
        continue;
      }
      const canary = createCanary();
      await appendEvalSectionToFile(stagedSkillFile, canary);
      canaries.push({ canary, skillLabel: skill.skillName, skillName: skill.skillName });
    }
  }

  return {
    workspaceRoot,
    workspacePath,
    deploymentPath,
    stagedPlugins,
    canaries,
    stagedSkillLabels: new Set(labels),
    skillDependencies: await surveySkillDependencies(skillFiles),
  };
}

export type StagedSkillFile = {
  skillLabel: string;
  // Undefined for a repo-local skill.
  pluginName?: string;
  skillName: string;
  // The committed SKILL.md the staged copy was made from; bodies differ only by the eval section.
  filePath: string;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// A skill whose body names another staged skill applies that skill inside its own workflow, so a
// read or load of the named skill in the same run is a dependency load, not a second
// trigger decision. Bodies name a skill as `plugin:skill` (also `$plugin:skill` in Codex prompt
// form) or, within the same plugin or among repo-local siblings, as the bare `skill` name.
export async function surveySkillDependencies(
  skillFiles: StagedSkillFile[],
): Promise<Map<string, ReadonlySet<string>>> {
  const bodies = await Promise.all(
    skillFiles.map((skillFile) => readFile(skillFile.filePath, "utf8")),
  );
  const dependencies = new Map<string, ReadonlySet<string>>();
  skillFiles.forEach((skillFile, index) => {
    const body = bodies[index] ?? "";
    const named = new Set<string>();
    for (const other of skillFiles) {
      if (other.skillLabel === skillFile.skillLabel) {
        continue;
      }
      const label = escapeRegExp(other.skillLabel);
      const forms = [`\`${label}\``, String.raw`\$${label}(?![\w:-])`];
      if (other.pluginName === skillFile.pluginName) {
        forms.push(`\`${escapeRegExp(other.skillName)}\``);
      }
      if (forms.some((form) => new RegExp(form).test(body))) {
        named.add(other.skillLabel);
      }
    }
    dependencies.set(skillFile.skillLabel, named);
  });
  return dependencies;
}

// A plugin target stages its own plugin first; a repo-local target owns no plugin, so it stages
// exactly the given entries.
function pluginsToStage(
  target: Skill,
  plugins: MarketplacePluginEntry[],
): MarketplacePluginEntry[] {
  if (target.kind !== "plugin") {
    return [...plugins];
  }

  return [
    { pluginName: target.pluginName, pluginPath: target.pluginPath },
    ...plugins.filter((entry) => entry.pluginName !== target.pluginName),
  ];
}

async function stagePluginCopies(
  deploymentPath: string,
  entries: MarketplacePluginEntry[],
): Promise<StagedPlugin[]> {
  const stagedPlugins: StagedPlugin[] = [];
  for (const entry of entries) {
    const copiedPluginPath = path.join(deploymentPath, "plugins", entry.pluginName);
    await mkdir(path.dirname(copiedPluginPath), { recursive: true });
    await cp(entry.pluginPath, copiedPluginPath, { recursive: true });
    stagedPlugins.push({
      pluginName: entry.pluginName,
      sourcePath: entry.pluginPath,
      version: await readPluginVersion(entry.pluginPath),
    });
  }

  return stagedPlugins;
}

// Returns the staged SKILL.md path.
async function stageRepoLocalSkill(
  workspacePath: string,
  skill: SkillDirectory,
  surface: ".agents" | ".claude",
): Promise<string> {
  const copiedSkillPath = path.join(workspacePath, surface, "skills", skill.skillName);
  await mkdir(path.dirname(copiedSkillPath), { recursive: true });
  await cp(skill.skillPath, copiedSkillPath, { recursive: true });
  return path.join(copiedSkillPath, "SKILL.md");
}

async function readPluginVersion(pluginPath: string): Promise<string> {
  // The portable manifest is authoritative for the plugin version; the Claude extension is the
  // fallback for a fixture that ships only .claude-plugin/plugin.json.
  const manifestPaths = [
    path.join(pluginPath, "plugin.json"),
    path.join(pluginPath, ".claude-plugin", "plugin.json"),
  ];
  for (const manifestPath of manifestPaths) {
    let content: string;
    try {
      content = await readFile(manifestPath, "utf8");
    } catch {
      continue;
    }

    const manifest = JSON.parse(content) as { version?: unknown };
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error(
        `${manifestPath}: expected plugin manifest version to be a non-empty string.`,
      );
    }

    return manifest.version;
  }

  throw new Error(
    `${pluginPath}: expected plugin.json or .claude-plugin/plugin.json to provide a plugin version.`,
  );
}
