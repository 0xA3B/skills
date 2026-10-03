import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  formatSkillLabel,
  listPluginSkills,
  listRepoLocalSkills,
  readAllowImplicitInvocation,
  resolveSkill,
  type Agent,
} from "../../skills/index.js";
import { parseTriggerFixture, type TriggerFixture } from "../fixtures/index.js";
import { listMarketplacePlugins } from "../marketplace.js";
import type { RunTriggerEvalOptions } from "../runner.js";

// Cases a selection reaches inside a fixture it does not select as a whole: dependent cases or
// seeded cases. They run and report under the skill that owns the fixture.
export type OwnedCases = {
  // Repo-relative path of the skill that owns the fixture.
  skillPath: string;
  label: string;
  // Ids of the cases, in fixture order.
  caseIds: string[];
};

export type FixtureScan<Found> = {
  found: Found[];
  // Fixtures the scan could not parse, so any cases it looks for in them are unknown. The plugin
  // linter reports the same problems; here they are surfaced instead of aborting the run.
  unreadableFixtures: Array<{ skillPath: string; message: string }>;
};

export type OwnersForAgent<Owner> = {
  runnable: Owner[];
  skipped: Array<{ label: string; reason: string }>;
};

// Reads the fixture of each given skill and keeps what pick finds in it. A skill without a fixture
// is passed over; a fixture that cannot be read or parsed is reported, and the scan goes on.
export async function scanFixtures<Found>(
  repoRoot: string,
  skillPaths: string[],
  pick: (fixture: TriggerFixture, owner: { skillPath: string; label: string }) => Found | undefined,
): Promise<FixtureScan<Found>> {
  const scan: FixtureScan<Found> = { found: [], unreadableFixtures: [] };
  for (const skillPath of skillPaths) {
    const target = resolveSkill(repoRoot, skillPath);
    let content: string;
    try {
      content = await readFile(target.fixturePath, "utf8");
    } catch (caught) {
      // No fixture is the common case; any other read failure hides possible cases.
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
    const found = pick(fixture, { skillPath, label: formatSkillLabel(target) });
    if (found !== undefined) {
      scan.found.push(found);
    }
  }
  return scan;
}

// The run options owned cases receive: the selection's case and fixture narrowing does not carry
// over, so the owner runs exactly those cases from its committed fixture.
export function ownedCasesRunOptions(
  runOptions: Omit<RunTriggerEvalOptions, "skillPath" | "agent" | "abortSignal">,
  owned: OwnedCases,
): Omit<RunTriggerEvalOptions, "agent" | "abortSignal"> {
  const { caseIds: _caseIds, fixturePath: _fixturePath, ...inherited } = runOptions;
  return { ...inherited, skillPath: owned.skillPath, caseIds: owned.caseIds };
}

// Owned cases run on the lanes their own fixture runs on: the agent's catalog must list the owning
// plugin, and the owning skill must be implicitly invokable on that agent. Repo-local skills are
// in every lane's deployment context.
export async function selectOwnersForAgent<Owner extends OwnedCases>(
  repoRoot: string,
  owners: Owner[],
  agent: Agent,
): Promise<OwnersForAgent<Owner>> {
  const catalogPluginPaths = new Set(
    (await listMarketplacePlugins(repoRoot, agent)).map((entry) => path.resolve(entry.pluginPath)),
  );
  const selected: OwnersForAgent<Owner> = { runnable: [], skipped: [] };
  for (const owner of owners) {
    const target = resolveSkill(repoRoot, owner.skillPath);
    if (target.kind === "plugin" && !catalogPluginPaths.has(path.resolve(target.pluginPath))) {
      selected.skipped.push({
        label: owner.label,
        reason: `plugin ${target.pluginName} is not in the ${agent} marketplace catalog`,
      });
      continue;
    }
    if (!(await readAllowImplicitInvocation(target, agent))) {
      selected.skipped.push({
        label: owner.label,
        reason: `${owner.label} is manual-only on ${agent}`,
      });
      continue;
    }
    selected.runnable.push(owner);
  }

  return selected;
}

// Every skill whose fixture can run on either agent: each catalog plugin's skills, then every
// repo-local skill, as repo-relative paths.
export async function listFixtureOwnerPaths(repoRoot: string): Promise<string[]> {
  const skillPaths: string[] = [];
  for (const plugin of await listCatalogPlugins(repoRoot)) {
    skillPaths.push(...(await listPluginSkillPaths(repoRoot, plugin)));
  }
  skillPaths.push(
    ...(await listRepoLocalSkills(repoRoot)).map((skill) => relativeTo(repoRoot, skill.skillPath)),
  );
  return skillPaths;
}

// Plugins from both catalogs, deduplicated by path and sorted, so a scan sees every fixture that
// can run on either agent.
export async function listCatalogPlugins(repoRoot: string): Promise<string[]> {
  const pluginPaths = new Set<string>();
  for (const agent of ["codex", "claude"] as const) {
    for (const entry of await listMarketplacePlugins(repoRoot, agent)) {
      pluginPaths.add(path.resolve(entry.pluginPath));
    }
  }
  return [...pluginPaths].sort();
}

export async function listPluginSkillPaths(
  repoRoot: string,
  pluginPath: string,
): Promise<string[]> {
  return (await listPluginSkills(pluginPath)).map((skill) => relativeTo(repoRoot, skill.skillPath));
}

export function relativeTo(repoRoot: string, skillPath: string): string {
  return path.relative(repoRoot, path.resolve(repoRoot, skillPath));
}
