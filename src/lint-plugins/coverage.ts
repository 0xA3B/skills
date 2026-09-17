import path from "node:path";

import { claudeExtensionPath } from "./claude-extension.js";
import { CODEX_EXTENSION_FIELD, CODEX_EXTENSION_POINTER } from "./codex-extension.js";
import { error, type ValidationContext, warning } from "./diagnostics.js";
import { isDirectory, isFile, readdirNames } from "./files.js";
import { portableManifestPath } from "./portable-manifest.js";
import type { PluginTargets } from "./types.js";

// A plugin is a bundle under plugins/<name>/, so the scan is flat and never enters other roots.
// Manifests elsewhere are not this repository's plugins: an agent worktree checkout under
// .claude/worktrees/, a copy nested inside a plugin bundle, or retired/, which archives skills
// rather than plugins (#107).
export async function listPluginPaths(repoRoot: string): Promise<string[]> {
  const pluginsPath = path.join(repoRoot, "plugins");
  if (!(await isDirectory(pluginsPath))) {
    return [];
  }
  return (await readdirNames(pluginsPath)).map((name) => path.join(pluginsPath, name));
}

// Repository decision: every plugin ships the portable manifest, and Codex settings live only in
// the Codex extension, so a .codex-plugin/ overlay is stale metadata that can drift. Returns
// whether the portable manifest exists, because nothing else about the plugin can be checked
// without it.
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
  shipped: PluginTargets;
};

// Repository decision: a plugin targets an agent exactly when it carries that agent's target
// extension and that agent's catalog lists it, and either half without the other is an error. The
// Claude catalog validator already drops a listing whose plugin has no Claude extension
// (claude-marketplace/source-manifest), so that direction is not repeated here. The rules below
// cover a Codex listing without the Codex extension, either extension without its listing, and a
// plugin that no catalog can reach.
export function validatePluginTargets(
  context: ValidationContext,
  coverage: PluginTargetCoverage,
): void {
  const { listed, pluginPath, shipped } = coverage;
  const manifestPath = portableManifestPath(pluginPath);

  if (listed.codex && !shipped.codex) {
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

  if (!shipped.codex && !shipped.claude) {
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
  localEntries: Map<string, { name: string; sourcePath: string; pointer: string }>;
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
