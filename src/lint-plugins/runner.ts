import path from "node:path";

import {
  validateClaudeMarketplace,
  validateClaudeRepositoryAlignment,
} from "./claude-marketplace.js";
import { validateClaudePlugin, validateDualManifestAlignment } from "./claude-plugin-manifest.js";
import {
  validateCatalogCoverage,
  validateClaudeCatalogCoverage,
  validateLocalRepositoryAlignment,
} from "./coverage.js";
import {
  createValidationContext,
  type ValidationContext,
  type ValidationOptions,
} from "./diagnostics.js";
import { validateExternalReferences } from "./external.js";
import { validateMarketplace } from "./marketplace.js";
import { printDiagnostics } from "./output.js";
import { validatePlugin } from "./plugin-manifest.js";
import { validateSkillsForPlugin } from "./skills/index.js";
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
  validateClaudeRepositoryAlignment(context, claudeCatalog);
  await validateCatalogCoverage(context, catalog);
  await validateClaudeCatalogCoverage(context, claudeCatalog);

  const units = new Map<string, PluginUnit>();
  for (const entry of catalog.localEntries.values()) {
    units.set(path.resolve(entry.pluginPath), { codexEntry: entry, pluginPath: entry.pluginPath });
  }
  for (const entry of claudeCatalog.localEntries.values()) {
    const key = path.resolve(entry.pluginPath);
    const unit = units.get(key);
    if (unit === undefined) {
      units.set(key, { claudeEntry: entry, pluginPath: entry.pluginPath });
    } else {
      unit.claudeEntry = entry;
    }
  }

  const sortedUnits = [...units.values()].sort((left, right) =>
    left.pluginPath.localeCompare(right.pluginPath),
  );
  for (const unit of sortedUnits) {
    const codexManifest =
      unit.codexEntry === undefined ? undefined : await validatePlugin(context, unit.codexEntry);
    if (unit.codexEntry !== undefined && codexManifest !== undefined) {
      manifestsByPath.set(unit.codexEntry.manifestPath, codexManifest);
    }

    const claudeManifest =
      unit.claudeEntry === undefined
        ? undefined
        : await validateClaudePlugin(context, unit.claudeEntry);
    if (unit.claudeEntry !== undefined && claudeManifest !== undefined) {
      manifestsByPath.set(unit.claudeEntry.manifestPath, claudeManifest);
    }

    if (
      unit.claudeEntry !== undefined &&
      claudeManifest !== undefined &&
      codexManifest !== undefined
    ) {
      validateDualManifestAlignment(
        context,
        unit.claudeEntry.manifestPath,
        claudeManifest,
        codexManifest,
      );
    }

    const codexReady = unit.codexEntry === undefined || codexManifest !== undefined;
    const claudeReady = unit.claudeEntry === undefined || claudeManifest !== undefined;
    const manifestPath = unit.codexEntry?.manifestPath ?? unit.claudeEntry?.manifestPath;
    if (!codexReady || !claudeReady || manifestPath === undefined) {
      continue;
    }

    await validateSkillsForPlugin(context, unit.pluginPath, manifestPath, codexManifest, {
      claude: unit.claudeEntry !== undefined,
      codex: unit.codexEntry !== undefined,
    });
  }

  await validateExternalReferences(context, catalog, claudeCatalog, manifestsByPath);

  const errorCount = context.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = context.diagnostics.length - errorCount;

  return { catalog, claudeCatalog, context, errorCount, pluginCount: units.size, warningCount };
}

export async function runLintPlugins(options: ValidationOptions = {}): Promise<void> {
  const { context, errorCount, pluginCount, warningCount } = await lintPlugins(options);
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
  console.log(`Linted ${pluginCount} local plugin(s)${externalLabel}.`);
}

export function runCli(options: ValidationOptions = {}): void {
  runLintPlugins(options).catch((caught: unknown) => {
    console.error(errorMessage(caught));
    process.exitCode = 1;
  });
}
