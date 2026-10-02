import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appendEvalSectionToFile } from "./canary.js";
import type { SkillCanary, StagedPlugin } from "./staging.js";

export const EVAL_MARKETPLACE_NAME = "trigger-eval";

type CodexHomeOptions = {
  codexHome: string;
  sourceCodexHome?: string;
  workspacePath: string;
  model: string;
  effort: string;
  marketplaceName?: string;
  // Local marketplace source directory. Kept outside the case workspace so the case cwd holds only
  // fixture files; defaults to the workspace for callers that stage the catalog there.
  marketplaceSourcePath?: string;
  pluginNames?: string[];
};

// The eval pins model and model_reasoning_effort explicitly so trigger results stay reproducible
// across machines; those keys are deliberately not inherited from the source config.
const TOP_LEVEL_CONFIG_KEYS = new Set([
  "model_reasoning_summary",
  "model_verbosity",
  "hide_agent_reasoning",
  "personality",
  "project_doc_max_bytes",
  "web_search",
]);

export async function prepareCodexHome(options: CodexHomeOptions): Promise<void> {
  const sourceCodexHome = options.sourceCodexHome ?? path.join(os.homedir(), ".codex");
  await mkdir(options.codexHome, { recursive: true });
  await copyRequiredFile(sourceCodexHome, options.codexHome, "auth.json");
  await copyOptionalFile(sourceCodexHome, options.codexHome, "installation_id");
  await writeFile(
    path.join(options.codexHome, "config.toml"),
    await buildEvalConfig(sourceCodexHome, options),
  );
}

export async function removeCopiedAuth(codexHome: string): Promise<void> {
  await rm(path.join(codexHome, "auth.json"), { force: true });
}

async function copyRequiredFile(
  sourceCodexHome: string,
  targetCodexHome: string,
  fileName: string,
): Promise<void> {
  try {
    await copyFile(path.join(sourceCodexHome, fileName), path.join(targetCodexHome, fileName));
  } catch (caught) {
    throw new Error(
      `Unable to copy required Codex ${fileName} into the trigger-eval CODEX_HOME: ${errorMessage(
        caught,
      )}`,
      { cause: caught },
    );
  }
}

async function copyOptionalFile(
  sourceCodexHome: string,
  targetCodexHome: string,
  fileName: string,
): Promise<void> {
  try {
    await copyFile(path.join(sourceCodexHome, fileName), path.join(targetCodexHome, fileName));
  } catch {
    // Optional compatibility file.
  }
}

async function buildEvalConfig(
  sourceCodexHome: string,
  options: CodexHomeOptions,
): Promise<string> {
  const sourceConfigPath = path.join(sourceCodexHome, "config.toml");
  const inheritedLines = await readTopLevelConfigLines(sourceConfigPath);

  const configLines = [
    ...inheritedLines,
    `model = ${tomlString(options.model)}`,
    `model_reasoning_effort = ${tomlString(options.effort)}`,
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    "",
    "[features]",
    "plugins = true",
    "shell_snapshot = false",
    "",
    "[shell_environment_policy]",
    'inherit = "core"',
    "",
    `[projects.${tomlString(options.workspacePath)}]`,
    'trust_level = "trusted"',
    "",
  ];

  if (
    options.marketplaceName !== undefined &&
    options.pluginNames !== undefined &&
    options.pluginNames.length > 0
  ) {
    configLines.push(
      `[marketplaces.${tomlString(options.marketplaceName)}]`,
      'source_type = "local"',
      `source = ${tomlString(options.marketplaceSourcePath ?? options.workspacePath)}`,
      "",
    );
    for (const pluginName of options.pluginNames) {
      configLines.push(
        `[plugins.${tomlString(`${pluginName}@${options.marketplaceName}`)}]`,
        "enabled = true",
        "",
      );
    }
  }

  return configLines.join("\n");
}

async function readTopLevelConfigLines(configPath: string): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch (caught: unknown) {
    if (isNodeError(caught) && caught.code === "ENOENT") {
      return [];
    }

    throw caught;
  }

  const lines: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith("[")) {
      break;
    }

    const match = line.match(/^(?<key>[A-Za-z0-9_]+)\s*=/);
    if (match?.groups?.["key"] !== undefined && TOP_LEVEL_CONFIG_KEYS.has(match.groups["key"])) {
      lines.push(line);
    }
  }

  return lines;
}

function tomlString(value: string): string {
  // TOML basic strings and JSON strings overlap for the path characters produced by os.homedir() and
  // plugin/marketplace identifiers. JSON.stringify is used as a deliberate simplification; values
  // containing \b, \f, or non-BMP unicode would need proper TOML escaping.
  return JSON.stringify(value);
}

// Codex installs plugins from a local marketplace catalog; the eval writes one listing every
// staged plugin beside the staged copies.
export async function writeCodexMarketplaceCatalog(
  deploymentPath: string,
  stagedPlugins: StagedPlugin[],
): Promise<void> {
  await mkdir(path.join(deploymentPath, ".agents", "plugins"), { recursive: true });
  await writeFile(
    path.join(deploymentPath, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(buildMarketplace(stagedPlugins), null, 2),
  );
}

// Codex reads skill bodies from the plugin cache, so staged plugins are copied there per case and
// the canaries must be present in the cached copies too.
export async function stageCodexPluginCaches(
  codexHome: string,
  stagedPlugins: StagedPlugin[],
  canaries: SkillCanary[],
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
    for (const skillCanary of canaries) {
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

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function isNodeError(value: unknown): value is Error & { code: string } {
  return (
    value instanceof Error &&
    "code" in value &&
    typeof (value as { code?: unknown }).code === "string"
  );
}
