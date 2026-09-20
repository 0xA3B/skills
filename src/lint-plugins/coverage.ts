import path from "node:path";

import { claudeExtensionPath } from "./claude-extension.js";
import { CODEX_EXTENSION_FIELD, CODEX_EXTENSION_POINTER } from "./codex-extension.js";
import { error, type ValidationContext, warning } from "./diagnostics.js";
import { isDirectory, isFile } from "./files.js";
import { portableManifestPath } from "./portable-manifest.js";
import type { PluginTargets, PluginTargetPresence } from "./types.js";

// Repository decision: every plugin ships the portable manifest, and Codex settings live only in
// the Codex extension, so a .codex-plugin/ overlay is stale metadata that can drift. Returns
// whether the portable manifest exists; independent extension and skill checks can still run.
export async function validatePluginLayout(
  context: ValidationContext,
  pluginPath: string,
): Promise<boolean> {
  const legacyOverlayPath = path.join(pluginPath, ".codex-plugin");
  if (await isDirectory(legacyOverlayPath)) {
    error(
      context,
      "coverage/legacy-codex-manifest",
      legacyOverlayPath,
      `Remove .codex-plugin/; this repository keeps Codex settings only in "${CODEX_EXTENSION_FIELD}" of plugin.json.`,
    );
  }

  // Agent Plugins 1.0.0: "The Agent Plugins core specification defines exactly one portable
  // manifest per plugin", and every directory under plugins/ is a plugin.
  const manifestPath = portableManifestPath(pluginPath);
  if (!(await isFile(manifestPath))) {
    error(
      context,
      "coverage/portable-manifest",
      manifestPath,
      "Missing plugin.json. Every plugin ships the Agent Plugins portable manifest at its root.",
    );
    return false;
  }
  return true;
}

export type PluginTargetCoverage = {
  // Whether .claude-plugin/marketplace.json exists at all; shapes the hint for unlisted plugins.
  claudeCatalogPresent: boolean;
  // Whether each catalog lists the plugin.
  listed: PluginTargets;
  pluginPath: string;
  // Whether the plugin carries each target extension.
  shipped: PluginTargetPresence;
};

// Target declarations and listings must agree. Missing Claude extension files are reported at
// each source declaration by repository validation; coverage owns the inverse and Codex presence.
// Unknown Codex presence suppresses only checks that require reading the portable manifest.
export function validatePluginTargets(
  context: ValidationContext,
  coverage: PluginTargetCoverage,
): void {
  const { listed, pluginPath, shipped } = coverage;
  const manifestPath = portableManifestPath(pluginPath);

  if (listed.codex && shipped.codex === false) {
    error(
      context,
      "coverage/codex-extension",
      manifestPath,
      `The Codex marketplace catalog lists this plugin, so plugin.json needs a "${CODEX_EXTENSION_FIELD}" object.`,
      CODEX_EXTENSION_POINTER,
    );
  }
  if (shipped.codex && !listed.codex) {
    error(
      context,
      "coverage/manifest-listed",
      manifestPath,
      "Plugin ships a Codex extension but is missing from the Codex marketplace catalog.",
    );
  }
  if (shipped.claude && !listed.claude) {
    const hint = coverage.claudeCatalogPresent
      ? ""
      : " Add .claude-plugin/marketplace.json to expose Claude plugins.";
    error(
      context,
      "coverage/manifest-listed",
      claudeExtensionPath(pluginPath),
      `Plugin ships a Claude extension but is missing from the Claude marketplace catalog.${hint}`,
    );
  }

  if (shipped.codex === false && !shipped.claude) {
    error(
      context,
      "coverage/target-required",
      manifestPath,
      `Plugin targets no agent. Add "${CODEX_EXTENSION_FIELD}" for Codex or .claude-plugin/plugin.json for Claude Code, plus the matching catalog entry.`,
    );
  }
}

// Shared across the Codex and Claude catalogs; both entry shapes satisfy this structural type.
type RepositoryAlignmentCatalog = {
  marketplacePath: string;
  localEntries: ReadonlyArray<{ name: string; sourcePath: string; pointer: string }>;
};

export function validateLocalRepositoryAlignment(
  context: ValidationContext,
  catalog: RepositoryAlignmentCatalog,
): void {
  for (const entry of catalog.localEntries.values()) {
    if (entry.sourcePath !== `./plugins/${entry.name}`) {
      warning(
        context,
        "alignment/source-path",
        catalog.marketplacePath,
        `Local source path usually matches "./plugins/<name>"; found "${entry.sourcePath}".`,
        entry.pointer,
      );
    }
  }
}
