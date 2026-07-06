import { readdir } from "node:fs/promises";
import path from "node:path";

import { error, type ValidationContext, warning } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
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

export async function findPluginManifests(
  searchRoot: string,
  manifestDirName = ".codex-plugin",
): Promise<string[]> {
  const skippedDirectoryNames = new Set([".cache", ".git", ".local", "node_modules"]);
  const manifests: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirectoryNames.has(entry.name)) {
          continue;
        }
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === "plugin.json") {
        if (path.basename(path.dirname(entryPath)) === manifestDirName) {
          manifests.push(entryPath);
        }
      }
    }
  }

  await visit(searchRoot);
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
