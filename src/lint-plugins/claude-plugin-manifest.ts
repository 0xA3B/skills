import { error, type ValidationContext, warning } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import { validateCommonManifestFields } from "./plugin-manifest.js";
import { getOptionalString } from "./schema.js";
import { CLAUDE_PLUGIN_AUTHOR_KEYS, CLAUDE_PLUGIN_MANIFEST_KEYS } from "./specs.js";
import type { ClaudeCatalogEntry, JsonObject } from "./types.js";

export async function validateClaudePlugin(
  context: ValidationContext,
  entry: ClaudeCatalogEntry,
): Promise<JsonObject | undefined> {
  const manifest = await readJsonObject(context, entry.manifestPath);

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
        entry.manifestPath,
        'Do not set "skills" in Claude plugin manifests; Claude Code auto-discovers ./skills/ and the field adds extra paths instead of replacing the default.',
        "/skills",
      );
      continue;
    }

    error(
      context,
      "claude-manifest/key",
      entry.manifestPath,
      `Unsupported Claude plugin manifest key "${key}" in this repository.`,
      `/${key}`,
    );
  }

  getOptionalString(context, manifest, "displayName", entry.manifestPath, "/displayName");

  const { author } = validateCommonManifestFields(context, manifest, entry);
  if (author !== undefined) {
    for (const key of Object.keys(author)) {
      if (!CLAUDE_PLUGIN_AUTHOR_KEYS.has(key)) {
        error(
          context,
          "claude-manifest/author-key",
          entry.manifestPath,
          `Unsupported Claude plugin author key "${key}".`,
          `/author/${key}`,
        );
      }
    }
  }

  return manifest;
}

export function validateDualManifestAlignment(
  context: ValidationContext,
  claudeManifestPath: string,
  claudeManifest: JsonObject,
  codexManifest: JsonObject,
): void {
  const claudeVersion = claudeManifest["version"];
  const codexVersion = codexManifest["version"];
  if (
    typeof claudeVersion === "string" &&
    typeof codexVersion === "string" &&
    claudeVersion !== codexVersion
  ) {
    error(
      context,
      "alignment/dual-version",
      claudeManifestPath,
      `Claude manifest version "${claudeVersion}" does not match Codex manifest version "${codexVersion}". Keep plugin versions in lockstep across harness manifests.`,
      "/version",
    );
  }

  const claudeDisplayName = claudeManifest["displayName"];
  const codexInterface = codexManifest["interface"];
  const codexDisplayName =
    typeof codexInterface === "object" && codexInterface !== null && !Array.isArray(codexInterface)
      ? (codexInterface as JsonObject)["displayName"]
      : undefined;
  if (
    typeof claudeDisplayName === "string" &&
    typeof codexDisplayName === "string" &&
    claudeDisplayName !== codexDisplayName
  ) {
    warning(
      context,
      "alignment/dual-display-name",
      claudeManifestPath,
      `Claude manifest displayName "${claudeDisplayName}" differs from Codex interface.displayName "${codexDisplayName}".`,
      "/displayName",
    );
  }
}
