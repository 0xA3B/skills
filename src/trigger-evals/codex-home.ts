import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type CodexHomeOptions = {
  codexHome: string;
  sourceCodexHome?: string;
  workspacePath: string;
  marketplaceName?: string;
  pluginName?: string;
};

const TOP_LEVEL_CONFIG_KEYS = new Set([
  "model",
  "model_reasoning_effort",
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

  if (options.marketplaceName !== undefined && options.pluginName !== undefined) {
    configLines.push(
      `[marketplaces.${tomlString(options.marketplaceName)}]`,
      'source_type = "local"',
      `source = ${tomlString(options.workspacePath)}`,
      "",
      `[plugins.${tomlString(`${options.pluginName}@${options.marketplaceName}`)}]`,
      "enabled = true",
      "",
    );
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

    const match = line.match(/^([A-Za-z0-9_]+)\s*=/);
    if (match?.[1] !== undefined && TOP_LEVEL_CONFIG_KEYS.has(match[1])) {
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
