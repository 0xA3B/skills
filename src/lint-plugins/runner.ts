import path from "node:path";

import {
  claudeExtensionPath,
  validateClaudeExtension,
  validateClaudeExtensionAlignment,
} from "./claude-extension.js";
import { validateClaudeMarketplace } from "./claude-marketplace.js";
import {
  listPluginPaths,
  validateLocalRepositoryAlignment,
  validatePluginLayout,
  validatePluginTargets,
} from "./coverage.js";
import {
  createValidationContext,
  type ValidationContext,
  type ValidationOptions,
} from "./diagnostics.js";
import { validateExternalReferences } from "./external.js";
import { isDirectory, readdirNames } from "./files.js";
import { validateMarketplace } from "./marketplace.js";
import { printDiagnostics } from "./output.js";
import { readPluginTargets } from "./plugin-targets.js";
import {
  codexInterface,
  portableManifestPath,
  validatePortableManifest,
} from "./portable-manifest.js";
import { validateSkill, validateSkillsForPlugin } from "./skills/index.js";
import type {
  Catalog,
  ClaudeCatalog,
  ClaudeCatalogEntry,
  JsonObject,
  LocalCatalogEntry,
} from "./types.js";
import { errorMessage } from "./utils.js";

export type LintResult = {
  catalog: Catalog;
  claudeCatalog: ClaudeCatalog;
  context: ValidationContext;
  errorCount: number;
  pluginCount: number;
  repoLocalSkillCount: number;
  warningCount: number;
};

type PluginUnit = {
  claudeEntry?: ClaudeCatalogEntry;
  codexEntry?: LocalCatalogEntry;
  pluginPath: string;
};

export async function lintPlugins(options: ValidationOptions = {}): Promise<LintResult> {
  const context = createValidationContext(options);
  const catalog = await validateMarketplace(context);
  const claudeCatalog = await validateClaudeMarketplace(context);
  const manifestsByPath = new Map<string, JsonObject>();
  validateLocalRepositoryAlignment(context, catalog);
  validateLocalRepositoryAlignment(context, claudeCatalog);

  // Every directory under plugins/ is a plugin, whether or not a catalog lists it; catalog entries
  // join by resolved path so an entry pointing elsewhere still gets its own unit.
  const units = new Map<string, PluginUnit>();
  for (const pluginPath of await listPluginPaths(context.repoRoot)) {
    units.set(path.resolve(pluginPath), { pluginPath });
  }
  for (const entry of catalog.localEntries.values()) {
    const key = path.resolve(entry.pluginPath);
    const unit = units.get(key) ?? { pluginPath: entry.pluginPath };
    unit.codexEntry = entry;
    units.set(key, unit);
  }
  for (const entry of claudeCatalog.localEntries.values()) {
    const key = path.resolve(entry.pluginPath);
    const unit = units.get(key) ?? { pluginPath: entry.pluginPath };
    unit.claudeEntry = entry;
    units.set(key, unit);
  }

  const sortedUnits = [...units.values()].sort((left, right) =>
    left.pluginPath.localeCompare(right.pluginPath),
  );
  for (const unit of sortedUnits) {
    await validatePluginUnit(context, unit, claudeCatalog.present, manifestsByPath);
  }

  const repoLocalSkillCount = await validateRepoLocalSkills(context);
  await validateExternalReferences(context, catalog, manifestsByPath);

  const errorCount = context.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = context.diagnostics.length - errorCount;

  return {
    catalog,
    claudeCatalog,
    context,
    errorCount,
    pluginCount: units.size,
    repoLocalSkillCount,
    warningCount,
  };
}

async function validatePluginUnit(
  context: ValidationContext,
  unit: PluginUnit,
  claudeCatalogPresent: boolean,
  manifestsByPath: Map<string, JsonObject>,
): Promise<void> {
  const { pluginPath } = unit;
  if (!(await validatePluginLayout(context, pluginPath))) {
    return;
  }

  const portable = await validatePortableManifest(context, {
    catalogName: unit.codexEntry?.name,
    category: unit.codexEntry?.category,
    pluginPath,
  });
  if (portable === undefined) {
    return;
  }
  manifestsByPath.set(portableManifestPath(pluginPath), portable.manifest);

  const shipped = await readPluginTargets(pluginPath, portable.manifest);
  validatePluginTargets(context, {
    claudeCatalogPresent,
    listed: { claude: unit.claudeEntry !== undefined, codex: unit.codexEntry !== undefined },
    pluginPath,
    shipped,
  });

  if (shipped.claude) {
    const claudeManifest = await validateClaudeExtension(context, {
      catalogName: unit.claudeEntry?.name,
      pluginPath,
    });
    if (claudeManifest !== undefined) {
      manifestsByPath.set(claudeExtensionPath(pluginPath), claudeManifest);
      validateClaudeExtensionAlignment(
        context,
        claudeExtensionPath(pluginPath),
        claudeManifest,
        portable.manifest,
        codexInterface(portable.manifest),
      );
    }
  }

  // A half-declared target (extension or listing alone) already errors above; its skills still
  // get that target's checks so the plugin surfaces every problem in one run.
  await validateSkillsForPlugin(context, pluginPath, {
    claude: shipped.claude || unit.claudeEntry !== undefined,
    codex: shipped.codex || unit.codexEntry !== undefined,
  });
}

// Repo-local skills ship to no plugin target, but every session in this checkout can load them on
// both agents, so they get the whole skill-level check set for both targets. Manifest, alignment,
// coverage, and catalog checks stay plugin-only.
async function validateRepoLocalSkills(context: ValidationContext): Promise<number> {
  const skillsPath = path.join(context.repoRoot, ".agents", "skills");
  if (!(await isDirectory(skillsPath))) {
    return 0;
  }
  const skillDirs = await readdirNames(skillsPath);
  for (const skillName of skillDirs) {
    await validateSkill(context, skillName, path.join(skillsPath, skillName), {
      claude: true,
      codex: true,
    });
  }
  return skillDirs.length;
}

export async function runLintPlugins(options: ValidationOptions = {}): Promise<void> {
  const { context, errorCount, pluginCount, repoLocalSkillCount, warningCount } =
    await lintPlugins(options);
  if (context.diagnostics.length > 0) {
    const status = errorCount > 0 ? "failed" : "completed";
    const summary = `Plugin lint ${status} with ${errorCount} error(s) and ${warningCount} warning(s):`;
    if (errorCount > 0) {
      console.error(summary);
      printDiagnostics(context, console.error);
    } else {
      console.log(summary);
      printDiagnostics(context, console.log);
    }
    process.exitCode = errorCount > 0 ? 1 : 0;
    return;
  }

  const externalLabel = context.externalValidationEnabled ? " with external checks" : "";
  console.log(
    `Linted ${pluginCount} local plugin(s) and ${repoLocalSkillCount} repo-local skill(s)${externalLabel}.`,
  );
}

export function runCli(options: ValidationOptions = {}): void {
  runLintPlugins(options).catch((caught: unknown) => {
    console.error(errorMessage(caught));
    process.exitCode = 1;
  });
}
