import { cp, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendEvalSectionToFile, createCanary } from "./canary.js";
import type { MarketplacePluginEntry } from "./marketplace.js";
import { readSkillFileAllowImplicitInvocation } from "./target.js";
import type { PluginSkillTarget, SkillTarget, TriggerEvalAgent } from "./types.js";

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

export type HarnessPaths = {
  workspacePath: string;
  workspaceRoot: string;
  codexHome: string;
  // Empty for repo-local targets.
  stagedPlugins: StagedPlugin[];
  // One canary per staged implicitly invokable plugin skill (plus the target), so a wrong skill
  // firing on Codex is observable and attributable. Empty for repo-local targets, which canary
  // per case instead.
  skillCanaries: SkillCanary[];
  // Every staged skill's label regardless of invocation policy — manual-only skills also surface
  // in Claude's init-event skills list, so the isolation check must expect them.
  stagedSkillLabels: string[];
};

export type PrepareHarnessOptions = {
  // Lane-specific staging (Claude settings and project-skill copies vs the Codex marketplace and
  // .agents skill copies) writes only the evaluated agent's surfaces, so the other agent's config
  // never pollutes the workspace under test.
  agent: TriggerEvalAgent;
  // Plugins staged alongside the target's plugin (marketplace mode). Entries matching the target
  // plugin are deduplicated.
  extraPlugins?: MarketplacePluginEntry[];
};

export async function prepareHarness(
  runDir: string,
  target: SkillTarget,
  options: PrepareHarnessOptions,
): Promise<HarnessPaths> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-eval-workspace-"));
  const workspacePath = path.join(workspaceRoot, "workspace");
  const codexHome = path.join(runDir, "codex-home");
  if (options.agent === "claude") {
    await writeClaudeEvalSettings(workspacePath);
  }
  if (target.kind === "plugin") {
    const pluginsToStage: MarketplacePluginEntry[] = [
      { pluginName: target.pluginName, pluginPath: target.pluginPath },
      ...(options.extraPlugins ?? []).filter((entry) => entry.pluginName !== target.pluginName),
    ];

    const stagedPlugins: StagedPlugin[] = [];
    for (const entry of pluginsToStage) {
      const copiedPluginPath = path.join(workspacePath, "plugins", entry.pluginName);
      await mkdir(path.dirname(copiedPluginPath), { recursive: true });
      await cp(entry.pluginPath, copiedPluginPath, { recursive: true });
      stagedPlugins.push({
        pluginName: entry.pluginName,
        sourcePath: entry.pluginPath,
        version: await readPluginVersion(entry.pluginPath),
      });
    }

    if (options.agent === "codex") {
      await mkdir(path.join(workspacePath, ".agents", "plugins"), { recursive: true });
      await writeFile(
        path.join(workspacePath, ".agents", "plugins", "marketplace.json"),
        JSON.stringify(buildMarketplace(stagedPlugins), null, 2),
      );
    }

    // Codex no longer emits skill-injection telemetry, so plugin evals detect invocation with
    // body-only canaries that the model sees once a skill's instructions load. Every implicitly
    // invokable staged skill gets its own canary so invoking the wrong skill is observable and
    // attributable, not an undifferentiated miss. One canary per skill per run is enough because
    // each case scans only its own output.
    const { skillCanaries, stagedSkillLabels } = await surveyStagedSkills(target, pluginsToStage);
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

    return {
      workspacePath,
      workspaceRoot,
      codexHome,
      stagedPlugins,
      skillCanaries,
      stagedSkillLabels,
    };
  }

  if (options.agent === "codex") {
    const copiedSkillPath = path.join(workspacePath, ".agents", "skills", target.skillName);
    await mkdir(path.dirname(copiedSkillPath), { recursive: true });
    await cp(target.skillPath, copiedSkillPath, { recursive: true });
  } else {
    // Claude Code discovers repo-local skills as project skills from .claude/skills. This copy
    // stays canary-free so the Claude lane tests the committed description; Claude invocation is
    // detected from Skill tool events instead.
    const claudeSkillPath = path.join(workspacePath, ".claude", "skills", target.skillName);
    await mkdir(path.dirname(claudeSkillPath), { recursive: true });
    await cp(target.skillPath, claudeSkillPath, { recursive: true });
  }

  return {
    workspacePath,
    workspaceRoot,
    codexHome,
    stagedPlugins: [],
    skillCanaries: [],
    stagedSkillLabels: [target.skillName],
  };
}

async function surveyStagedSkills(
  target: PluginSkillTarget,
  stagedPlugins: MarketplacePluginEntry[],
): Promise<{ skillCanaries: SkillCanary[]; stagedSkillLabels: string[] }> {
  const skillCanaries: SkillCanary[] = [];
  const stagedSkillLabels: string[] = [];
  for (const entry of stagedPlugins) {
    for (const skillName of await listPluginSkillNames(entry.pluginPath)) {
      const skillLabel = `${entry.pluginName}:${skillName}`;
      stagedSkillLabels.push(skillLabel);

      const isTarget = entry.pluginName === target.pluginName && skillName === target.skillName;
      const skillFilePath = path.join(entry.pluginPath, "skills", skillName, "SKILL.md");
      // Manual-only siblings cannot fire implicitly, so they stay canary-free. The target is
      // always canaried; --force runs would otherwise lose their invocation signal.
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

async function writeClaudeEvalSettings(workspacePath: string): Promise<void> {
  const settingsPath = path.join(workspacePath, ".claude", "settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ disableBundledSkills: true }, null, 2)}\n`);
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
