import path from "node:path";

import {
  claudeExtensionPath,
  validateClaudeExtension,
  validateClaudeExtensionAlignment,
} from "./claude-extension.js";
import { validateClaudeMarketplace } from "./claude-marketplace.js";
import { CODEX_EXTENSION_POINTER } from "./codex-extension.js";
import {
  validateLocalRepositoryAlignment,
  validatePluginLayout,
  validatePluginTargets,
} from "./coverage.js";
import { error, type ValidationContext } from "./diagnostics.js";
import { isDirectory, isFile, readdirNames } from "./files.js";
import { validateMarketplace } from "./marketplace.js";
import {
  codexInterface,
  portableManifestPath,
  validatePortableManifest,
} from "./portable-manifest.js";
import type {
  Catalog,
  ClaudeCatalog,
  ClaudeCatalogEntry,
  JsonObject,
  LocalCatalogEntry,
  PluginTargetPresence,
  PluginTargets,
} from "./types.js";

type PluginDeclarations = {
  pluginPath: string;
  codex: LocalCatalogEntry[];
  claude: ClaudeCatalogEntry[];
};

// Returns only known missing targets; an unreadable portable manifest already has a diagnostic.
export type FindMissingPluginTargets = (
  pluginName: string,
  required: PluginTargets,
) => Array<keyof PluginTargets>;

export type PluginRepository = {
  catalog: Catalog;
  claudeCatalog: ClaudeCatalog;
  plugins: ReadonlyArray<{ pluginPath: string; targets: PluginTargets }>;
  missingTargets: FindMissingPluginTargets;
};

// One lint-run snapshot owns discovery, source checks, and target relationships. Catalog readers
// retain declarations even when their files are missing. Joining by path never discards entries.
// All plugin facts are resolved before skill routing checks consult another plugin's targets.
export async function validatePluginRepository(
  context: ValidationContext,
): Promise<PluginRepository> {
  const catalog = await validateMarketplace(context);
  const claudeCatalog = await validateClaudeMarketplace(context);
  validateLocalRepositoryAlignment(context, catalog);
  validateLocalRepositoryAlignment(context, claudeCatalog);

  const units = new Map<string, PluginDeclarations>();
  function unitFor(pluginPath: string): PluginDeclarations {
    const key = path.resolve(pluginPath);
    let unit = units.get(key);
    if (unit === undefined) {
      unit = { pluginPath: key, codex: [], claude: [] };
      units.set(key, unit);
    }
    return unit;
  }

  // Scan exactly plugins/<name>; never enter agent worktrees, nested bundles, or retired skills.
  const pluginsPath = path.join(context.repoRoot, "plugins");
  if (await isDirectory(pluginsPath)) {
    for (const name of await readdirNames(pluginsPath)) {
      unitFor(path.join(pluginsPath, name));
    }
  }
  for (const entry of catalog.localEntries) {
    unitFor(entry.pluginPath).codex.push(entry);
  }
  for (const entry of claudeCatalog.localEntries) {
    unitFor(entry.pluginPath).claude.push(entry);
  }

  const plugins: Array<{ pluginPath: string; targets: PluginTargets }> = [];
  const shippedTargets = new Map<string, PluginTargetPresence>();
  for (const unit of [...units.values()].sort((a, b) => a.pluginPath.localeCompare(b.pluginPath))) {
    const { pluginPath } = unit;
    const directoryExists = await isDirectory(pluginPath);
    const portableExists = directoryExists && (await validatePluginLayout(context, pluginPath));
    const claudeExists = directoryExists && (await isFile(claudeExtensionPath(pluginPath)));
    validateSources(
      context,
      unit.codex,
      catalog.marketplacePath,
      "marketplace",
      directoryExists,
      portableExists,
      "plugin.json",
    );
    validateSources(
      context,
      unit.claude,
      claudeCatalog.marketplacePath,
      "claude-marketplace",
      directoryExists,
      claudeExists,
      ".claude-plugin/plugin.json",
    );

    if (!directoryExists) {
      continue;
    }

    const portable = portableExists
      ? await validatePortableManifest(context, { pluginPath })
      : undefined;
    const shipped: PluginTargetPresence = {
      claude: claudeExists,
      codex: portable === undefined ? undefined : portable.codexExtension !== undefined,
    };
    const listed = { claude: unit.claude.length > 0, codex: unit.codex.length > 0 };
    shippedTargets.set(pluginPath, shipped);
    plugins.push({
      pluginPath,
      targets: {
        claude: shipped.claude || listed.claude,
        codex: shipped.codex === true || listed.codex,
      },
    });
    validatePluginTargets(context, {
      pluginPath,
      listed,
      shipped,
      claudeCatalogPresent: claudeCatalog.present,
    });

    if (portable !== undefined) {
      const manifestPath = portableManifestPath(pluginPath);
      for (const entry of unit.codex) {
        validateCatalogName(context, manifestPath, portable.manifest, entry.name);
        const category = codexInterface(portable.manifest)?.["category"];
        if (
          entry.category !== undefined &&
          typeof category === "string" &&
          category.length > 0 &&
          entry.category !== category
        ) {
          error(
            context,
            "alignment/category",
            manifestPath,
            `Plugin interface category "${category}" does not match marketplace category "${entry.category}".`,
            `${CODEX_EXTENSION_POINTER}/interface/category`,
          );
        }
      }
    }

    if (claudeExists) {
      const claudeManifest = await validateClaudeExtension(context, { pluginPath });
      if (claudeManifest !== undefined) {
        const manifestPath = claudeExtensionPath(pluginPath);
        for (const entry of unit.claude) {
          validateCatalogName(context, manifestPath, claudeManifest, entry.name);
        }
        if (portable !== undefined) {
          validateClaudeExtensionAlignment(
            context,
            manifestPath,
            claudeManifest,
            portable.manifest,
            codexInterface(portable.manifest),
          );
        }
      }
    }
  }
  return {
    catalog,
    claudeCatalog,
    plugins,
    missingTargets(pluginName, required) {
      const shipped = shippedTargets.get(path.resolve(context.repoRoot, "plugins", pluginName));
      return (["claude", "codex"] as const).filter(
        (target) => required[target] && (shipped === undefined || shipped[target] === false),
      );
    },
  };
}

function validateCatalogName(
  context: ValidationContext,
  manifestPath: string,
  manifest: JsonObject,
  catalogName: string,
): void {
  const name = manifest["name"];
  if (typeof name === "string" && name.length > 0 && name !== catalogName) {
    error(
      context,
      "alignment/name",
      manifestPath,
      `Manifest name "${name}" does not match marketplace name "${catalogName}".`,
      "/name",
    );
  }
}

function validateSources(
  context: ValidationContext,
  entries: ReadonlyArray<ClaudeCatalogEntry>,
  marketplacePath: string,
  prefix: "marketplace" | "claude-marketplace",
  directoryExists: boolean,
  manifestExists: boolean,
  manifestName: string,
): void {
  for (const entry of entries) {
    if (!directoryExists) {
      error(
        context,
        `${prefix}/source-exists`,
        marketplacePath,
        `Plugin path does not exist or is not a directory: ${entry.sourcePath}`,
        entry.pointer,
      );
    } else if (!manifestExists) {
      error(
        context,
        `${prefix}/source-manifest`,
        marketplacePath,
        `Plugin path is missing ${manifestName}: ${entry.sourcePath}`,
        entry.pointer,
      );
    }
  }
}
