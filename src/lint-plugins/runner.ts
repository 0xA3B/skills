import path from "node:path";

import {
  createValidationContext,
  type ValidationContext,
  type ValidationOptions,
} from "./diagnostics.js";
import { isDirectory, readdirNames } from "./files.js";
import { printDiagnostics } from "./output.js";
import { validatePluginRepository, type PluginRepository } from "./repository.js";
import { validateSkill, validateSkillsForPlugin } from "./skills/index.js";
import type { Catalog, ClaudeCatalog } from "./types.js";
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

export async function lintPlugins(options: ValidationOptions = {}): Promise<LintResult> {
  const context = createValidationContext(options);
  const repository = await validatePluginRepository(context);
  const { catalog, claudeCatalog } = repository;
  for (const plugin of repository.plugins) {
    await validateSkillsForPlugin(
      context,
      plugin.pluginPath,
      plugin.targets,
      repository.missingTargets,
    );
  }
  const repoLocalSkillCount = await validateRepoLocalSkills(context, repository);

  const errorCount = context.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = context.diagnostics.length - errorCount;

  return {
    catalog,
    claudeCatalog,
    context,
    errorCount,
    pluginCount: repository.plugins.length,
    repoLocalSkillCount,
    warningCount,
  };
}

// Repo-local skills ship to no plugin target, but every session in this checkout can load them on
// both agents, so they get the whole skill-level check set for both targets. Manifest, alignment,
// coverage, and catalog checks stay plugin-only.
async function validateRepoLocalSkills(
  context: ValidationContext,
  repository: PluginRepository,
): Promise<number> {
  const skillsPath = path.join(context.repoRoot, ".agents", "skills");
  if (!(await isDirectory(skillsPath))) {
    return 0;
  }
  const skillDirs = await readdirNames(skillsPath);
  for (const skillName of skillDirs) {
    await validateSkill(
      context,
      skillName,
      path.join(skillsPath, skillName),
      {
        claude: true,
        codex: true,
      },
      repository.missingTargets,
    );
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

  console.log(
    `Linted ${pluginCount} local plugin(s) and ${repoLocalSkillCount} repo-local skill(s).`,
  );
}

export function runCli(options: ValidationOptions = {}): void {
  runLintPlugins(options).catch((caught: unknown) => {
    console.error(errorMessage(caught));
    process.exitCode = 1;
  });
}
