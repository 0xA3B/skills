import { validateCatalogCoverage, validateLocalRepositoryAlignment } from "./coverage.js";
import {
  createValidationContext,
  type ValidationContext,
  type ValidationOptions,
} from "./diagnostics.js";
import { validateExternalReferences } from "./external.js";
import { validateMarketplace } from "./marketplace.js";
import { printDiagnostics } from "./output.js";
import { validatePlugin } from "./plugin-manifest.js";
import { validateSkillsForEntry } from "./skills/index.js";
import type { Catalog, JsonObject } from "./types.js";
import { errorMessage } from "./utils.js";

export type LintResult = {
  catalog: Catalog;
  context: ValidationContext;
  errorCount: number;
  warningCount: number;
};

export async function lintPlugins(options: ValidationOptions = {}): Promise<LintResult> {
  const context = createValidationContext(options);
  const catalog = await validateMarketplace(context);
  const manifestsByPath = new Map<string, JsonObject>();
  validateLocalRepositoryAlignment(context, catalog);
  await validateCatalogCoverage(context, catalog);

  for (const entry of catalog.localEntries.values()) {
    const manifest = await validatePlugin(context, entry);
    if (manifest !== undefined) {
      manifestsByPath.set(entry.manifestPath, manifest);
      await validateSkillsForEntry(context, entry, manifest);
    }
  }

  await validateExternalReferences(context, catalog, manifestsByPath);

  const errorCount = context.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = context.diagnostics.length - errorCount;

  return { catalog, context, errorCount, warningCount };
}

export async function runLintPlugins(options: ValidationOptions = {}): Promise<void> {
  const { catalog, context, errorCount, warningCount } = await lintPlugins(options);
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
  console.log(`Linted ${catalog.localEntries.size} local plugin(s)${externalLabel}.`);
}

export function runCli(options: ValidationOptions = {}): void {
  runLintPlugins(options).catch((caught: unknown) => {
    console.error(errorMessage(caught));
    process.exitCode = 1;
  });
}
