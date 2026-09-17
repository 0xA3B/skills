import { readdir } from "node:fs/promises";
import path from "node:path";

import { error, type ValidationContext, warning } from "./diagnostics.js";
import { isDirectory, isFile, readJsonObject } from "./files.js";
import type { Catalog, ClaudeCatalog } from "./types.js";

export async function validateCatalogCoverage(
  context: ValidationContext,
  catalog: Catalog,
): Promise<void> {
  await validateManifestCoverage(context, {
    catalogLabel: "Codex marketplace catalog",
    catalogNames: new Set([
      ...catalog.localEntries.keys(),
      ...catalog.remoteEntries.map((entry) => entry.name),
    ]),
    catalogPaths: new Set(
      [...catalog.localEntries.values()].map((entry) => path.resolve(entry.pluginPath)),
    ),
    manifestDirName: ".codex-plugin",
    missingCatalogHint: "",
  });
}

export async function validateClaudeCatalogCoverage(
  context: ValidationContext,
  catalog: ClaudeCatalog,
): Promise<void> {
  await validateManifestCoverage(context, {
    catalogLabel: "Claude marketplace catalog",
    catalogNames: new Set(catalog.localEntries.keys()),
    catalogPaths: new Set(
      [...catalog.localEntries.values()].map((entry) => path.resolve(entry.pluginPath)),
    ),
    manifestDirName: ".claude-plugin",
    missingCatalogHint: catalog.present
      ? ""
      : " Add .claude-plugin/marketplace.json to expose Claude plugins.",
  });
}

type ManifestCoverageOptions = {
  catalogLabel: string;
  catalogNames: Set<string>;
  catalogPaths: Set<string>;
  manifestDirName: string;
  missingCatalogHint: string;
};

async function validateManifestCoverage(
  context: ValidationContext,
  options: ManifestCoverageOptions,
): Promise<void> {
  const manifests = await findPluginManifests(context.repoRoot, options.manifestDirName);

  for (const manifestPath of manifests) {
    const pluginPath = path.dirname(path.dirname(manifestPath));
    if (!options.catalogPaths.has(pluginPath)) {
      const manifest = await readJsonObject(context, manifestPath);
      const manifestName =
        manifest !== undefined && typeof manifest["name"] === "string"
          ? manifest["name"]
          : path.basename(pluginPath);
      const nameHint = options.catalogNames.has(manifestName)
        ? ` Marketplace has "${manifestName}", but it points somewhere else.`
        : "";
      error(
        context,
        "coverage/manifest-listed",
        manifestPath,
        `Plugin manifest is missing from the ${options.catalogLabel}.${nameHint}${options.missingCatalogHint}`,
      );
    }
  }
}

// A plugin is a bundle under plugins/<name>/, so the scan is flat and never enters other roots.
// Manifests elsewhere are not this repository's plugins: an agent worktree checkout under
// .claude/worktrees/, a copy nested inside a plugin bundle, or retired/, which archives skills
// rather than plugins (#107). Plugin names are lowercase kebab-case by convention, so a dot-prefixed
// entry under plugins/ is scratch, matching the skill walk.
export async function findPluginManifests(
  repoRoot: string,
  manifestDirName = ".codex-plugin",
): Promise<string[]> {
  const pluginsPath = path.join(repoRoot, "plugins");
  if (!(await isDirectory(pluginsPath))) {
    return [];
  }
  const entries = await readdir(pluginsPath, { withFileTypes: true });
  const manifests: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const manifestPath = path.join(pluginsPath, entry.name, manifestDirName, "plugin.json");
    if (await isFile(manifestPath)) {
      manifests.push(manifestPath);
    }
  }
  return manifests.sort();
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
