import path from "node:path";

import { error, type ValidationContext, warning } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import { getOptionalObject, getOptionalString, getString, validateStringArray } from "./schema.js";
import { CLAUDE_PLUGIN_AUTHOR_KEYS, CLAUDE_PLUGIN_MANIFEST_KEYS } from "./specs.js";
import type { ClaudeCatalogEntry, JsonObject } from "./types.js";
import { validateUrlString } from "./urls.js";

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

  const manifestName = getString(context, manifest, "name", entry.manifestPath, "/name");
  getString(context, manifest, "version", entry.manifestPath, "/version");
  getString(context, manifest, "description", entry.manifestPath, "/description");
  getOptionalString(context, manifest, "displayName", entry.manifestPath, "/displayName");
  getOptionalString(context, manifest, "license", entry.manifestPath, "/license");

  const repository = getOptionalString(
    context,
    manifest,
    "repository",
    entry.manifestPath,
    "/repository",
  );
  validateUrlString(context, repository, entry.manifestPath, "/repository", "url/http");

  const homepage = getOptionalString(
    context,
    manifest,
    "homepage",
    entry.manifestPath,
    "/homepage",
  );
  validateUrlString(context, homepage, entry.manifestPath, "/homepage", "url/http");

  if (manifestName !== undefined && manifestName !== entry.name) {
    error(
      context,
      "alignment/name",
      entry.manifestPath,
      `Manifest name "${manifestName}" does not match marketplace name "${entry.name}".`,
      "/name",
    );
  }

  if (manifestName !== undefined && path.basename(entry.pluginPath) !== manifestName) {
    error(
      context,
      "alignment/directory-name",
      entry.manifestPath,
      `Plugin directory "${path.basename(entry.pluginPath)}" does not match manifest name "${manifestName}".`,
      "/name",
    );
  }

  const author = getOptionalObject(context, manifest, "author", entry.manifestPath, "/author");
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
    getString(context, author, "name", entry.manifestPath, "/author/name");
    const authorUrl = getOptionalString(context, author, "url", entry.manifestPath, "/author/url");
    validateUrlString(context, authorUrl, entry.manifestPath, "/author/url", "url/http");
    getOptionalString(context, author, "email", entry.manifestPath, "/author/email");
  }

  validateStringArray(context, manifest["keywords"], "keywords", entry.manifestPath, "/keywords", {
    required: false,
  });

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
