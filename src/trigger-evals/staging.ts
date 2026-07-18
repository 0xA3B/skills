import { cp, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendEvalSectionToFile, createCanary, withTriggerEvalInstructions } from "./canary.js";
import type { MarketplacePluginEntry } from "./marketplace.js";
import { readSkillFileAllowImplicitInvocation } from "./target.js";
import type { PluginSkillTarget, SkillTarget, TriggerCase } from "./types.js";

export const EVAL_MARKETPLACE_NAME = "trigger-eval";

export type StagedPlugin = {
  pluginName: string;
  // Committed plugin directory the staged copies were made from; the Codex plugin cache copies
  // from here again per case.
  sourcePath: string;
  version: string;
};

export type SkillCanary = {
  canary: string;
  pluginName: string;
  skillName: string;
  skillLabel: string;
};

export type StagedWorkspace = {
  workspaceRoot: string;
  workspacePath: string;
};

export async function createStagedWorkspace(): Promise<StagedWorkspace> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-eval-workspace-"));
  return { workspaceRoot, workspacePath: path.join(workspaceRoot, "workspace") };
}

// Dedupe entries matching the target's plugin so marketplace staging never stages it twice.
export function pluginsToStage(
  target: PluginSkillTarget,
  extraPlugins: MarketplacePluginEntry[],
): MarketplacePluginEntry[] {
  return [
    { pluginName: target.pluginName, pluginPath: target.pluginPath },
    ...extraPlugins.filter((entry) => entry.pluginName !== target.pluginName),
  ];
}

export async function stagePluginCopies(
  workspacePath: string,
  entries: MarketplacePluginEntry[],
): Promise<StagedPlugin[]> {
  const stagedPlugins: StagedPlugin[] = [];
  for (const entry of entries) {
    const copiedPluginPath = path.join(workspacePath, "plugins", entry.pluginName);
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

export async function writeCodexMarketplaceCatalog(
  workspacePath: string,
  stagedPlugins: StagedPlugin[],
): Promise<void> {
  await mkdir(path.join(workspacePath, ".agents", "plugins"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(buildMarketplace(stagedPlugins), null, 2),
  );
}

export async function writeClaudeEvalSettings(workspacePath: string): Promise<void> {
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ disableBundledSkills: true }, null, 2)}\n`);
}

// One canary per staged implicitly invokable plugin skill (plus the target), so a wrong skill
// firing is observable and attributable, not an undifferentiated miss. Manual-only siblings
// cannot fire implicitly, so they stay canary-free; the target is always canaried because --force
// runs would otherwise lose their invocation signal. Labels cover every staged skill regardless
// of invocation policy — manual-only skills also surface in loaded-skills observations, so the
// isolation check must expect them.
export async function surveyStagedSkills(
  target: PluginSkillTarget,
  entries: MarketplacePluginEntry[],
): Promise<{ skillCanaries: SkillCanary[]; stagedSkillLabels: string[] }> {
  const skillCanaries: SkillCanary[] = [];
  const stagedSkillLabels: string[] = [];
  for (const entry of entries) {
    for (const skillName of await listPluginSkillNames(entry.pluginPath)) {
      const skillLabel = `${entry.pluginName}:${skillName}`;
      stagedSkillLabels.push(skillLabel);

      const isTarget = entry.pluginName === target.pluginName && skillName === target.skillName;
      const skillFilePath = path.join(entry.pluginPath, "skills", skillName, "SKILL.md");
      if (!isTarget && !(await readSkillFileAllowImplicitInvocation(skillFilePath))) {
        continue;
      }

      skillCanaries.push({
        canary: createCanary(),
        pluginName: entry.pluginName,
        skillName,
        skillLabel,
      });
    }
  }

  return { skillCanaries, stagedSkillLabels };
}

export async function appendStagedSkillCanaries(
  workspacePath: string,
  skillCanaries: SkillCanary[],
): Promise<void> {
  for (const skillCanary of skillCanaries) {
    await appendEvalSectionToFile(
      path.join(
        workspacePath,
        "plugins",
        skillCanary.pluginName,
        "skills",
        skillCanary.skillName,
        "SKILL.md",
      ),
      skillCanary.canary,
    );
  }
}

// Codex discovers repo-local skills under .agents/skills; Claude Code discovers them as project
// skills under .claude/skills.
export async function stageRepoLocalSkill(
  workspacePath: string,
  target: SkillTarget,
  surface: ".agents" | ".claude",
): Promise<void> {
  const copiedSkillPath = path.join(workspacePath, surface, "skills", target.skillName);
  await mkdir(path.dirname(copiedSkillPath), { recursive: true });
  await cp(target.skillPath, copiedSkillPath, { recursive: true });
}

// Copies the shared base workspace into a case-isolated one and applies the fixture's workspace
// files. Callers that need no per-case mutation should keep using the base workspace instead.
export async function stageCaseWorkspace(options: {
  baseWorkspacePath: string;
  workspaceRoot: string;
  testCase: TriggerCase;
}): Promise<string> {
  const workspacePath = path.join(options.workspaceRoot, "cases", options.testCase.id, "workspace");
  await cp(options.baseWorkspacePath, workspacePath, { recursive: true });

  for (const [relativeFilePath, content] of Object.entries(options.testCase.workspaceFiles ?? {})) {
    const absoluteFilePath = path.join(workspacePath, relativeFilePath);
    await mkdir(path.dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, content);
  }

  return workspacePath;
}

export function stagedSkillFilePath(workspacePath: string, target: SkillTarget): string {
  if (target.kind === "plugin") {
    return path.join(
      workspacePath,
      "plugins",
      target.pluginName,
      "skills",
      target.skillName,
      "SKILL.md",
    );
  }

  return path.join(workspacePath, ".agents", "skills", target.skillName, "SKILL.md");
}

// Rewrites the staged copy's description so the canary is reachable from skill metadata alone;
// used where no injection telemetry exists (repo-local skills on Codex).
export async function injectRepoLocalCanary(
  workspacePath: string,
  target: SkillTarget,
  canary: string,
): Promise<void> {
  const skillFilePath = stagedSkillFilePath(workspacePath, target);
  const content = await readFile(skillFilePath, "utf8");
  await writeFile(skillFilePath, withTriggerEvalInstructions(content, canary));
}

// Codex reads skill bodies from the plugin cache, so staged plugins are copied there per case and
// the canaries must be present in the cached copies too.
export async function stageCodexPluginCaches(
  codexHome: string,
  stagedPlugins: StagedPlugin[],
  skillCanaries: SkillCanary[],
): Promise<void> {
  for (const stagedPlugin of stagedPlugins) {
    const cachedPluginPath = path.join(
      codexHome,
      "plugins",
      "cache",
      EVAL_MARKETPLACE_NAME,
      stagedPlugin.pluginName,
      stagedPlugin.version,
    );
    await mkdir(path.dirname(cachedPluginPath), { recursive: true });
    await cp(stagedPlugin.sourcePath, cachedPluginPath, { recursive: true });
    for (const skillCanary of skillCanaries) {
      if (skillCanary.pluginName !== stagedPlugin.pluginName) {
        continue;
      }
      await appendEvalSectionToFile(
        path.join(cachedPluginPath, "skills", skillCanary.skillName, "SKILL.md"),
        skillCanary.canary,
      );
    }
  }
}

async function listPluginSkillNames(pluginPath: string): Promise<string[]> {
  const skillsPath = path.join(pluginPath, "skills");
  let entries;
  try {
    entries = await readdir(skillsPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const skillNames: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      await stat(path.join(skillsPath, entry.name, "SKILL.md"));
      skillNames.push(entry.name);
    } catch {
      // Not a skill directory.
    }
  }

  return skillNames.sort();
}

function buildMarketplace(stagedPlugins: StagedPlugin[]): unknown {
  return {
    name: EVAL_MARKETPLACE_NAME,
    interface: {
      displayName: "Trigger Eval Marketplace",
    },
    plugins: stagedPlugins.map((stagedPlugin) => ({
      name: stagedPlugin.pluginName,
      source: {
        source: "local",
        path: `./plugins/${stagedPlugin.pluginName}`,
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Productivity",
    })),
  };
}

async function readPluginVersion(pluginPath: string): Promise<string> {
  // Claude-only plugins ship no Codex manifest, so fall back to the Claude manifest for the
  // staged plugin version.
  const manifestPaths = [
    path.join(pluginPath, ".codex-plugin", "plugin.json"),
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
    `${pluginPath}: expected .codex-plugin/plugin.json or .claude-plugin/plugin.json to provide a plugin version.`,
  );
}
