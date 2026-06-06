import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PluginSkillTarget, SkillTarget } from "./types.js";

export const EVAL_MARKETPLACE_NAME = "trigger-eval";

export type HarnessPaths = {
  workspacePath: string;
  workspaceRoot: string;
  codexHome: string;
  pluginVersion?: string;
};

export async function prepareHarness(runDir: string, target: SkillTarget): Promise<HarnessPaths> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-eval-workspace-"));
  const workspacePath = path.join(workspaceRoot, "workspace");
  const codexHome = path.join(runDir, "codex-home");
  if (target.kind === "plugin") {
    const copiedPluginPath = path.join(workspacePath, "codex_plugins", target.pluginName);
    const pluginVersion = await readPluginVersion(target);
    await mkdir(path.join(workspacePath, ".agents", "plugins"), { recursive: true });
    await mkdir(path.dirname(copiedPluginPath), { recursive: true });
    await cp(target.pluginPath, copiedPluginPath, { recursive: true });
    await writeFile(
      path.join(workspacePath, ".agents", "plugins", "marketplace.json"),
      JSON.stringify(buildMarketplace(target), null, 2),
    );

    return {
      workspacePath,
      workspaceRoot,
      codexHome,
      pluginVersion,
    };
  }

  const copiedSkillPath = path.join(workspacePath, ".agents", "skills", target.skillName);
  await mkdir(path.dirname(copiedSkillPath), { recursive: true });
  await cp(target.skillPath, copiedSkillPath, { recursive: true });

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
          path: `./codex_plugins/${target.pluginName}`,
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
