import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendEvalSectionToFile, createCanary } from "./canary.js";
import type { PluginSkillTarget, SkillTarget } from "./types.js";

export const EVAL_MARKETPLACE_NAME = "trigger-eval";

export type HarnessPaths = {
  workspacePath: string;
  workspaceRoot: string;
  codexHome: string;
  pluginVersion?: string;
  pluginCanary?: string;
};

export async function prepareHarness(runDir: string, target: SkillTarget): Promise<HarnessPaths> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-eval-workspace-"));
  const workspacePath = path.join(workspaceRoot, "workspace");
  const codexHome = path.join(runDir, "codex-home");
  if (target.kind === "plugin") {
    const copiedPluginPath = path.join(workspacePath, "plugins", target.pluginName);
    const pluginVersion = await readPluginVersion(target);
    await mkdir(path.join(workspacePath, ".agents", "plugins"), { recursive: true });
    await mkdir(path.dirname(copiedPluginPath), { recursive: true });
    await cp(target.pluginPath, copiedPluginPath, { recursive: true });
    await writeFile(
      path.join(workspacePath, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(buildMarketplace(target), null, 2),
    );

    // Codex no longer emits skill-injection telemetry, so plugin evals detect invocation with a
    // body-only canary that the model sees once the skill instructions load. One canary per run is
    // enough because each case scans only its own output.
    const pluginCanary = createCanary();
    await appendEvalSectionToFile(
      path.join(copiedPluginPath, "skills", target.skillName, "SKILL.md"),
      pluginCanary,
    );

    return {
      workspacePath,
      workspaceRoot,
      codexHome,
      pluginVersion,
      pluginCanary,
    };
  }

  const copiedSkillPath = path.join(workspacePath, ".agents", "skills", target.skillName);
  await mkdir(path.dirname(copiedSkillPath), { recursive: true });
  await cp(target.skillPath, copiedSkillPath, { recursive: true });

  // Claude Code discovers repo-local skills as project skills from .claude/skills. This copy stays
  // canary-free so the Claude lane tests the committed description; Claude invocation is detected
  // from Skill tool events instead.
  const claudeSkillPath = path.join(workspacePath, ".claude", "skills", target.skillName);
  await mkdir(path.dirname(claudeSkillPath), { recursive: true });
  await cp(target.skillPath, claudeSkillPath, { recursive: true });

  return {
    workspacePath,
    workspaceRoot,
    codexHome,
  };
}

function buildMarketplace(target: PluginSkillTarget): unknown {
  return {
    name: EVAL_MARKETPLACE_NAME,
    interface: {
      displayName: "Trigger Eval Marketplace",
    },
    plugins: [
      {
        name: target.pluginName,
        source: {
          source: "local",
          path: `./plugins/${target.pluginName}`,
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Productivity",
      },
    ],
  };
}

async function readPluginVersion(target: PluginSkillTarget): Promise<string> {
  const manifestPath = path.join(target.pluginPath, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${manifestPath}: expected plugin manifest version to be a non-empty string.`);
  }

  return manifest.version;
}
