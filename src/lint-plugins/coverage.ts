import { readdir } from "node:fs/promises";
import path from "node:path";

import { error, type ValidationContext, warning } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import type { Catalog } from "./types.js";

export async function validateCatalogCoverage(
  context: ValidationContext,
  catalog: Catalog,
): Promise<void> {
  const catalogPaths = new Set(
    [...catalog.localEntries.values()].map((entry) => path.resolve(entry.pluginPath)),
  );
  const catalogNames = new Set([
    ...catalog.localEntries.keys(),
    ...catalog.remoteEntries.map((entry) => entry.name),
  ]);
  const manifests = await findPluginManifests(context.repoRoot);

  for (const manifestPath of manifests) {
    const pluginPath = path.dirname(path.dirname(manifestPath));
    if (!catalogPaths.has(pluginPath)) {
      const manifest = await readJsonObject(context, manifestPath);
      const manifestName =
        manifest !== undefined && typeof manifest["name"] === "string"
          ? manifest["name"]
          : path.basename(pluginPath);
      const nameHint = catalogNames.has(manifestName)
        ? ` Marketplace has "${manifestName}", but it points somewhere else.`
        : "";
      error(
        context,
        "coverage/manifest-listed",
        manifestPath,
        `Plugin manifest is missing from the marketplace catalog.${nameHint}`,
      );
    }
  }
}

export async function findPluginManifests(searchRoot: string): Promise<string[]> {
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
        if (path.basename(path.dirname(entryPath)) === ".codex-plugin") {
          manifests.push(entryPath);
        }
      }
    }
  }

  await visit(searchRoot);
  return manifests.sort();
}

export function validateLocalRepositoryAlignment(
  context: ValidationContext,
  catalog: Catalog,
): void {
  for (const entry of catalog.localEntries.values()) {
    if (entry.sourcePath !== `./codex_plugins/${entry.name}`) {
      warning(
        context,
        "alignment/source-path",
        catalog.marketplacePath,
        `Local source path usually matches "./codex_plugins/<name>"; found "${entry.sourcePath}".`,
        entry.pointer,
      );
    }
  }
}
