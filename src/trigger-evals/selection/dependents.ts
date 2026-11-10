import path from "node:path";

import { formatSkillLabel, resolveSkill } from "../../skills/index.js";
import {
  type FixtureScan,
  listCatalogPlugins,
  listFixtureOwnerPaths,
  listPluginSkillPaths,
  type OwnedCases,
  relativeTo,
  scanFixtures,
} from "./owned-cases.js";
import type { SkillSelection } from "./suite.js";

// The dependent cases one fixture holds for a selection: skip cases whose routing assertion names
// a selected skill, and compound cases that list one. They live in another skill's fixture, so
// they run and report under that skill.
export type DependentFixture = OwnedCases & {
  // The selected skills those cases name, in first-seen order.
  namedSkills: string[];
};

// The skills a selection covers, as repo-relative paths. Routing assertions that name any of them
// are the selection's dependents; a plugin selection covers every skill directory in the plugin,
// fixture or not, because a fixtureless skill can still be the route of another fixture's case.
export async function listSelectedSkillPaths(
  repoRoot: string,
  selection: SkillSelection,
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

// Scans every catalog plugin fixture and every repo-local fixture for cases that name the selected
// skills. Fixtures owned by a selected skill are left out: the suite already ran them in full.
export async function findDependentFixtures(
  repoRoot: string,
  selectedSkillPaths: string[],
): Promise<FixtureScan<DependentFixture>> {
  const selected = new Set(selectedSkillPaths.map((skillPath) => relativeTo(repoRoot, skillPath)));
  const selectedLabels = new Set(
    [...selected].map((skillPath) => formatSkillLabel(resolveSkill(repoRoot, skillPath))),
  );
  const ownerPaths = (await listFixtureOwnerPaths(repoRoot)).filter(
    (skillPath) => !selected.has(skillPath),
  );

  return scanFixtures(repoRoot, ownerPaths, (fixture, owner) => {
    const caseIds: string[] = [];
    const namedSkills: string[] = [];
    for (const testCase of fixture.cases) {
      const named = [
        ...(testCase.invokeInstead === undefined ? [] : [testCase.invokeInstead]),
        ...(testCase.invokeOr ?? []),
      ].filter((label) => selectedLabels.has(label));
      if (named.length === 0) {
        continue;
      }
      caseIds.push(testCase.id);
      for (const label of named) {
        if (!namedSkills.includes(label)) {
          namedSkills.push(label);
        }
      }
    }
    return caseIds.length > 0 ? { ...owner, caseIds, namedSkills } : undefined;
  });
}
