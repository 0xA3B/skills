import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { TriggerEvalSelection } from "./cli-options.js";
import { parseTriggerFixture } from "./fixtures.js";
import { listMarketplacePlugins } from "./marketplace.js";
import type { RunTriggerEvalOptions } from "./runner.js";
import { listRepoLocalSkills } from "./staging.js";
import { readAllowImplicitInvocation, resolveSkillTarget, skillTargetLabel } from "./target.js";
import type { TriggerEvalAgent } from "./types.js";

// The dependent cases one fixture holds for a selection: skip cases whose routing assertion names
// a selected skill. They live in another skill's fixture, so they run and report under that skill.
export type DependentFixture = {
  // Repo-relative path of the skill that owns the fixture.
  skillPath: string;
  label: string;
  // Ids of the dependent cases, in fixture order.
  caseIds: string[];
  // The selected skills those cases route to, in first-seen order.
  routesTo: string[];
};

export type DependentScan = {
  dependents: DependentFixture[];
  // Fixtures the scan could not parse, so any routing cases in them are unknown. The plugin
  // linter reports the same problems; here they are surfaced instead of aborting the run.
  unreadableFixtures: Array<{ skillPath: string; message: string }>;
};

export type DependentsForAgent = {
  runnable: DependentFixture[];
  skipped: Array<{ label: string; reason: string }>;
};

// The skills a selection covers, as repo-relative paths. Routing assertions that name any of them
// are the selection's dependents; a plugin selection covers every skill directory in the plugin,
// fixture or not, because a fixtureless skill can still be the route of another fixture's case.
export async function listSelectedSkillPaths(
  repoRoot: string,
  selection: TriggerEvalSelection,
): Promise<string[]> {
  if (selection.mode === "skill") {
    return [relativeTo(repoRoot, selection.skillPath)];
  }
  if (selection.mode === "plugin") {
    return listPluginSkillPaths(repoRoot, path.resolve(repoRoot, selection.pluginPath));
  }
  if (selection.skillPaths.length > 0) {
    return selection.skillPaths.map((skillPath) => relativeTo(repoRoot, skillPath));
  }

  const skillPaths: string[] = [];
  for (const plugin of await listCatalogPlugins(repoRoot)) {
    skillPaths.push(...(await listPluginSkillPaths(repoRoot, plugin)));
  }
  return skillPaths;
}

// Scans every catalog plugin fixture and every repo-local fixture for cases routing to the selected
// skills. Fixtures owned by a selected skill are left out: the suite already ran them in full.
export async function findDependentFixtures(
  repoRoot: string,
  selectedSkillPaths: string[],
): Promise<DependentScan> {
  const selected = new Set(selectedSkillPaths.map((skillPath) => relativeTo(repoRoot, skillPath)));
  const selectedLabels = new Set(
    [...selected].map((skillPath) => skillTargetLabel(resolveSkillTarget(repoRoot, skillPath))),
  );

  const candidateSkillPaths: string[] = [];
  for (const plugin of await listCatalogPlugins(repoRoot)) {
    candidateSkillPaths.push(...(await listPluginSkillPaths(repoRoot, plugin)));
  }
  candidateSkillPaths.push(
    ...(await listRepoLocalSkills(repoRoot)).map((skill) => relativeTo(repoRoot, skill.skillPath)),
  );

  const scan: DependentScan = { dependents: [], unreadableFixtures: [] };
  for (const skillPath of candidateSkillPaths) {
    if (selected.has(skillPath)) {
      continue;
    }
    const target = resolveSkillTarget(repoRoot, skillPath);
    let content: string;
    try {
      content = await readFile(target.fixturePath, "utf8");
    } catch (caught) {
      // No fixture is the common case; any other read failure hides possible routing cases.
      if ((caught as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      scan.unreadableFixtures.push({
        skillPath,
        message: caught instanceof Error ? caught.message : String(caught),
      });
      continue;
    }
    const { fixture, findings } = parseTriggerFixture(content);
    if (fixture === undefined) {
      scan.unreadableFixtures.push({
        skillPath,
        message: findings.map((finding) => finding.message).join(" "),
      });
      continue;
    }
    const caseIds: string[] = [];
    const routesTo: string[] = [];
    for (const testCase of fixture.cases) {
      if (testCase.invokeInstead === undefined || !selectedLabels.has(testCase.invokeInstead)) {
        continue;
      }
      caseIds.push(testCase.id);
      if (!routesTo.includes(testCase.invokeInstead)) {
        routesTo.push(testCase.invokeInstead);
      }
    }
    if (caseIds.length > 0) {
      scan.dependents.push({ skillPath, label: skillTargetLabel(target), caseIds, routesTo });
    }
  }

  return scan;
}

// The run options a dependent receives: the selection's case and fixture narrowing does not carry
// over, so a dependent runs exactly its routing cases from its committed fixture.
export function dependentRunOptions(
  runOptions: Omit<RunTriggerEvalOptions, "skillPath" | "agent" | "abortSignal" | "lane">,
  dependent: DependentFixture,
): Omit<RunTriggerEvalOptions, "agent" | "abortSignal" | "lane"> {
  const { caseIds: _caseIds, fixturePath: _fixturePath, ...inherited } = runOptions;
  return { ...inherited, skillPath: dependent.skillPath, caseIds: dependent.caseIds };
}

// A dependent runs on the lanes its own fixture runs on: the agent's catalog must list the owning
// plugin, and the owning skill must be implicitly invokable on that agent. Repo-local skills are
// in every lane's deployment context.
export async function selectDependentsForAgent(
  repoRoot: string,
  dependents: DependentFixture[],
  agent: TriggerEvalAgent,
): Promise<DependentsForAgent> {
  const catalogPluginPaths = new Set(
    (await listMarketplacePlugins(repoRoot, agent)).map((entry) => path.resolve(entry.pluginPath)),
  );
  const selected: DependentsForAgent = { runnable: [], skipped: [] };
  for (const dependent of dependents) {
    const target = resolveSkillTarget(repoRoot, dependent.skillPath);
    if (target.kind === "plugin" && !catalogPluginPaths.has(path.resolve(target.pluginPath))) {
      selected.skipped.push({
        label: dependent.label,
        reason: `plugin ${target.pluginName} is not in the ${agent} marketplace catalog`,
      });
      continue;
    }
    if (!(await readAllowImplicitInvocation(target, agent))) {
      selected.skipped.push({
        label: dependent.label,
        reason: `${dependent.label} is manual-only on ${agent}`,
      });
      continue;
    }
    selected.runnable.push(dependent);
  }

  return selected;
}

// Plugins from both catalogs, deduplicated by path and sorted, so a scan sees every fixture that
// can run on either agent.
async function listCatalogPlugins(repoRoot: string): Promise<string[]> {
  const pluginPaths = new Set<string>();
  for (const agent of ["codex", "claude"] as const) {
    for (const entry of await listMarketplacePlugins(repoRoot, agent)) {
      pluginPaths.add(path.resolve(entry.pluginPath));
    }
  }
  return [...pluginPaths].sort();
}

async function listPluginSkillPaths(repoRoot: string, pluginPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(pluginPath, "skills"), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => relativeTo(repoRoot, path.join(pluginPath, "skills", entry.name)))
    .sort();
}

function relativeTo(repoRoot: string, skillPath: string): string {
  return path.relative(repoRoot, path.resolve(repoRoot, skillPath));
}
