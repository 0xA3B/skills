import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SkillTarget } from "./types.js";

export const EVAL_MARKETPLACE_NAME = "trigger-eval";

export type HarnessPaths = {
  workspacePath: string;
  codexHome: string;
};

export async function prepareHarness(runDir: string, target: SkillTarget): Promise<HarnessPaths> {
  const workspacePath = path.join(runDir, "workspace");
  const codexHome = path.join(runDir, "codex-home");
  const copiedPluginPath = path.join(workspacePath, "codex_plugins", target.pluginName);
  const pluginVersion = await readPluginVersion(target);
  const cachedPluginPath = path.join(
    codexHome,
    "plugins",
    "cache",
    EVAL_MARKETPLACE_NAME,
    target.pluginName,
    pluginVersion,
  );
  await mkdir(path.join(workspacePath, ".agents", "plugins"), { recursive: true });
  await mkdir(path.dirname(copiedPluginPath), { recursive: true });
  await mkdir(path.dirname(cachedPluginPath), { recursive: true });
  await cp(target.pluginPath, copiedPluginPath, { recursive: true });
  await cp(target.pluginPath, cachedPluginPath, { recursive: true });
  await writeFile(
    path.join(workspacePath, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(buildMarketplace(target), null, 2),
  );

  return {
    workspacePath,
    codexHome,
  };
}

function buildMarketplace(target: SkillTarget): unknown {
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

async function readPluginVersion(target: SkillTarget): Promise<string> {
  const manifestPath = path.join(target.pluginPath, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${manifestPath}: expected plugin manifest version to be a non-empty string.`);
  }

  return manifest.version;
}
