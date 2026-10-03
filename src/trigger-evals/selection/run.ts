import type { Agent } from "../../skills/index.js";
import { formatCheckout } from "../checkout.js";
import { findSeedPath } from "../fixtures/index.js";
import { type RunTriggerEvalOptions, runTriggerEval, type TriggerEvalResult } from "../runner.js";
import {
  type DependentFixture,
  findDependentFixtures,
  listSelectedSkillPaths,
} from "./dependents.js";
import {
  type FixtureScan,
  type OwnedCases,
  ownedCasesRunOptions,
  selectOwnersForAgent,
} from "./owned-cases.js";
import { findSeededFixtures } from "./seeded.js";
import { selectSuite, type TriggerEvalSelection } from "./suite.js";

// Where a selection run reports as it goes, so a long run shows each result when it lands.
export type SelectionReporter = {
  // A progress or summary line.
  info(message: string): void;
  // A line explaining why the run cannot end green.
  error(message: string): void;
  // One skill's eval result, or one fixture's dependent or seeded cases.
  result(result: TriggerEvalResult): void;
};

// The per-eval options every run in the selection shares.
export type SelectionEvalOptions = Omit<
  RunTriggerEvalOptions,
  "repoRoot" | "skillPath" | "agent" | "abortSignal"
>;

export type SelectionRunOptions = {
  repoRoot: string;
  selection: TriggerEvalSelection;
  agents: Agent[];
  // Also run the dependent cases: routing assertions in other fixtures that name a selected skill.
  // A seed selection names no skill, so it ignores this; the CLI refuses the combination.
  withDependents?: boolean;
  evalOptions: SelectionEvalOptions;
  abortSignal?: AbortSignal;
  reporter: SelectionReporter;
};

// Runs the selection's suite on each agent in turn, then the dependent cases that route to it; a
// seed selection runs the seed's seeded cases instead. Returns true only for a green run: false
// when a case failed, a fixture a scan needed was unreadable, a suite or seed ran nothing on an
// agent, or the run was aborted. An error that ends an eval ends the run and propagates.
export async function runSelection(options: SelectionRunOptions): Promise<boolean> {
  const { repoRoot, selection, reporter, abortSignal } = options;
  const aborted = () => abortSignal?.aborted === true;
  let ok = true;
  if (options.evalOptions.checkout !== undefined) {
    reporter.info(formatCheckout(options.evalOptions.checkout));
  }
  if (selection.mode === "seed") {
    return (await runSeed(options, selection.seedName)) && !aborted();
  }
  const { found: dependents, unreadableFixtures } =
    options.withDependents === true
      ? await findDependentFixtures(repoRoot, await listSelectedSkillPaths(repoRoot, selection))
      : { found: [], unreadableFixtures: [] };
  ok = reportUnreadableFixtures(reporter, unreadableFixtures, "dependent") && ok;
  if (options.withDependents === true && dependents.length === 0) {
    reporter.info("No dependent cases route to the selected skills.");
  }

  for (const agent of options.agents) {
    if (aborted()) {
      break;
    }
    const suite = await selectSuite(repoRoot, selection, agent);
    if (suite.manualOnlySkillPaths.length > 0) {
      reporter.info(
        `Skipping manual-only skills on ${agent}: ${suite.manualOnlySkillPaths.join(", ")}.`,
      );
    }
    if (suite.outOfCatalogSkillPaths.length > 0) {
      reporter.info(
        `Skipping skills whose plugin is not in the ${agent} marketplace catalog: ${suite.outOfCatalogSkillPaths.join(", ")}.`,
      );
    }

    const tally = { ran: 0, passed: 0 };
    for (const skillPath of suite.skillPaths) {
      if (aborted()) {
        break;
      }
      const result = await runTriggerEval({
        ...options.evalOptions,
        repoRoot,
        skillPath,
        agent,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      });
      ok = record(reporter, tally, result) && ok;
    }

    if (selection.mode !== "skill") {
      const suiteName = selection.mode === "plugin" ? "Plugin" : "Marketplace";
      if (tally.ran > 0) {
        reporter.info(
          `${suiteName} suite on ${agent}: ${tally.passed}/${tally.ran} skills passed.`,
        );
      } else if (!aborted()) {
        // Zero runs must not read as a green suite: this happens when every candidate skill was
        // excluded as manual-only or, for a marketplace selection, outside this agent's catalog,
        // so no eval actually executed.
        reporter.error(
          `${suiteName} suite on ${agent}: ran 0 skills — every candidate skill is manual-only or outside this agent's marketplace catalog.`,
        );
        ok = false;
      }
    }

    if (dependents.length > 0 && !aborted()) {
      ok = (await runDependents(options, dependents, agent)) && ok;
    }
  }

  return ok && !aborted();
}

// Dependent cases run under their owning fixture, on that fixture's own lanes. Returns false when
// a dependent case failed.
async function runDependents(
  options: SelectionRunOptions,
  dependents: DependentFixture[],
  agent: Agent,
): Promise<boolean> {
  const { ok, tally } = await runOwnedCases(options, dependents, agent, {
    kind: "dependent",
    describe: (dependent) =>
      `Dependent cases in ${dependent.label} routing to ${dependent.routesTo.join(", ")}: ${dependent.caseIds.join(", ")}.`,
  });
  if (tally.ran > 0) {
    options.reporter.info(`Dependent fixtures on ${agent}: ${tally.passed}/${tally.ran} passed.`);
  }
  return ok;
}

// A seed selection runs each fixture's seeded cases under its owner, on that fixture's own lanes.
// An unknown seed throws before anything runs; a seed with no seeded case, or an agent whose lanes
// run none of them, cannot end green.
async function runSeed(options: SelectionRunOptions, seedName: string): Promise<boolean> {
  const { repoRoot, reporter, abortSignal } = options;
  const aborted = () => abortSignal?.aborted === true;
  await findSeedPath(repoRoot, seedName);
  const { found: seeded, unreadableFixtures } = await findSeededFixtures(repoRoot, seedName);
  let ok = reportUnreadableFixtures(reporter, unreadableFixtures, "seeded");
  if (seeded.length === 0) {
    reporter.error(
      `Seed ${seedName}: ran 0 fixtures — no trigger fixture case resolves to this seed.`,
    );
    return false;
  }

  for (const agent of options.agents) {
    if (aborted()) {
      break;
    }
    const run = await runOwnedCases(options, seeded, agent, {
      kind: "seeded",
      describe: (owner) => `Seeded cases in ${owner.label}: ${owner.caseIds.join(", ")}.`,
    });
    ok = run.ok && ok;
    if (run.tally.ran > 0) {
      reporter.info(
        `Seed ${seedName} on ${agent}: ${run.tally.passed}/${run.tally.ran} fixtures passed.`,
      );
    } else if (!aborted()) {
      // Zero runs must not read as a green seed run: every owner was skipped on this agent.
      reporter.error(
        `Seed ${seedName} on ${agent}: ran 0 fixtures — every fixture with seeded cases is manual-only or outside this agent's marketplace catalog.`,
      );
      ok = false;
    }
  }
  return ok;
}

// How a report line names owned cases: the dependent cases of a skill selection, or the seeded
// cases of a seed selection.
type OwnedCasesKind = "dependent" | "seeded";

// A fixture the scan could not read may hold cases the selection reaches, so the run still
// executes every discovered case but cannot end green. Returns false when any fixture was
// unreadable.
function reportUnreadableFixtures(
  reporter: SelectionReporter,
  unreadableFixtures: FixtureScan<unknown>["unreadableFixtures"],
  kind: OwnedCasesKind,
): boolean {
  for (const unreadable of unreadableFixtures) {
    reporter.error(
      `ERROR: could not scan the fixture of ${unreadable.skillPath} for ${kind} cases, so the ${kind} set is incomplete: ${unreadable.message}`,
    );
  }
  return unreadableFixtures.length === 0;
}

// Runs each owner's cases on the agent, reporting the owners the agent's lanes skip. The run's ok
// is false when an owned case failed.
async function runOwnedCases<Owner extends OwnedCases>(
  options: SelectionRunOptions,
  owners: Owner[],
  agent: Agent,
  report: { kind: OwnedCasesKind; describe: (owner: Owner) => string },
): Promise<{ ok: boolean; tally: { ran: number; passed: number } }> {
  const { repoRoot, reporter, abortSignal } = options;
  const { runnable, skipped } = await selectOwnersForAgent(repoRoot, owners, agent);
  for (const entry of skipped) {
    reporter.info(`Skipping ${report.kind} cases in ${entry.label} on ${agent}: ${entry.reason}.`);
  }
  const tally = { ran: 0, passed: 0 };
  let ok = true;
  for (const owner of runnable) {
    if (abortSignal?.aborted === true) {
      break;
    }
    reporter.info(report.describe(owner));
    const result = await runTriggerEval({
      ...ownedCasesRunOptions(options.evalOptions, owner),
      repoRoot,
      agent,
      ...(abortSignal === undefined ? {} : { abortSignal }),
    });
    ok = record(reporter, tally, result) && ok;
  }
  return { ok, tally };
}

// Reports one result and returns false when any of its cases failed. A manual-only skip runs no
// case, so it does not fail the run, but it does not count as a passed skill either.
function record(
  reporter: SelectionReporter,
  tally: { ran: number; passed: number },
  result: TriggerEvalResult,
): boolean {
  reporter.result(result);
  tally.ran += 1;
  const casesPassed = result.results.every((caseResult) => caseResult.passed);
  if (result.skippedReason === undefined && casesPassed) {
    tally.passed += 1;
  }
  return casesPassed;
}
