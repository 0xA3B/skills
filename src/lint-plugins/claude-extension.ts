import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { error, type ValidationContext } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import { validateCommonManifestFields } from "./manifest-fields.js";
import { getOptionalString } from "./schema.js";
import {
  CLAUDE_PLUGIN_AUTHOR_KEYS,
  CLAUDE_PLUGIN_MANIFEST_KEYS,
  PORTABLE_MANIFEST_KEYS,
} from "./specs.js";
import type { JsonObject } from "./types.js";

// The Claude extension: .claude-plugin/plugin.json, the only manifest Claude Code reads. Source:
// https://code.claude.com/docs/en/plugins-reference.md (manifest fields) and
// https://code.claude.com/docs/en/plugins.md (auto-discovery of ./skills/).
export function claudeExtensionPath(pluginPath: string): string {
  return path.join(pluginPath, ".claude-plugin", "plugin.json");
}

export type ClaudeExtensionOptions = {
  // The plugin's name in the Claude marketplace catalog, when the catalog lists it.
  catalogName?: string | undefined;
  pluginPath: string;
};

export async function validateClaudeExtension(
  context: ValidationContext,
  options: ClaudeExtensionOptions,
): Promise<JsonObject | undefined> {
  const { pluginPath } = options;
  const manifestPath = claudeExtensionPath(pluginPath);
  const manifest = await readJsonObject(context, manifestPath);

  if (manifest === undefined) {
    return undefined;
  }

  for (const key of Object.keys(manifest)) {
    if (CLAUDE_PLUGIN_MANIFEST_KEYS.has(key)) {
      continue;
    }

    if (key === "skills") {
      error(
        context,
        "claude-manifest/skills-path",
        manifestPath,
        'Do not set "skills" in Claude plugin manifests; Claude Code auto-discovers ./skills/ and the field adds extra paths instead of replacing the default.',
        "/skills",
      );
      continue;
    }

    error(
      context,
      "claude-manifest/key",
      manifestPath,
      `Unsupported Claude plugin manifest key "${key}" in this repository.`,
      `/${key}`,
    );
  }

  getOptionalString(context, manifest, "displayName", manifestPath, "/displayName");

  const { author } = validateCommonManifestFields(context, manifest, {
    catalogName: options.catalogName,
    manifestPath,
    pluginPath,
  });
  if (author !== undefined) {
    for (const key of Object.keys(author)) {
      if (!CLAUDE_PLUGIN_AUTHOR_KEYS.has(key)) {
        error(
          context,
          "claude-manifest/author-key",
          manifestPath,
          `Unsupported Claude plugin author key "${key}".`,
          `/author/${key}`,
        );
      }
    }
  }

  return manifest;
}

// Fields the Claude extension duplicates from the portable manifest. $schema and extensions are
// portable-only, so every other portable key is a candidate.
const SHARED_KEYS = [...PORTABLE_MANIFEST_KEYS].filter(
  (key) => key !== "$schema" && key !== "extensions",
);

// Repository decision: the portable manifest is authoritative, so a field the Claude extension
// duplicates must match it exactly (version lockstep is one case), and the display name must match
// the Codex extension so both catalogs show one name. Objects compare structurally because JSON
// key order carries no meaning.
export function validateClaudeExtensionAlignment(
  context: ValidationContext,
  claudeManifestPath: string,
  claudeManifest: JsonObject,
  portableManifest: JsonObject,
  codexInterface: JsonObject | undefined,
): void {
  for (const key of Object.keys(claudeManifest)) {
    if (!SHARED_KEYS.includes(key)) {
      continue;
    }
    const claudeValue = claudeManifest[key];
    const portableValue = portableManifest[key];
    if (!isDeepStrictEqual(claudeValue, portableValue)) {
      error(
        context,
        "alignment/claude-extension",
        claudeManifestPath,
        `Claude extension "${key}" (${JSON.stringify(claudeValue)}) does not match the portable manifest (${portableValue === undefined ? "absent" : JSON.stringify(portableValue)}); plugin.json is authoritative.`,
        `/${key}`,
      );
    }
  }

  const claudeDisplayName = claudeManifest["displayName"];
  const codexDisplayName = codexInterface?.["displayName"];
  if (
    typeof claudeDisplayName === "string" &&
    typeof codexDisplayName === "string" &&
    claudeDisplayName !== codexDisplayName
  ) {
    error(
      context,
      "alignment/dual-display-name",
      claudeManifestPath,
      `Claude extension displayName "${claudeDisplayName}" does not match the Codex extension interface.displayName "${codexDisplayName}".`,
      "/displayName",
    );
  }
}
