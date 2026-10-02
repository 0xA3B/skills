import type { Agent } from "../../skills/index.js";
import { type RunTriggerEvalOptions, runTriggerEval, type TriggerEvalResult } from "../runner.js";
import {
  type DependentFixture,
  dependentRunOptions,
  findDependentFixtures,
  listSelectedSkillPaths,
  selectDependentsForAgent,
} from "./dependents.js";
import { selectSuite, type TriggerEvalSelection } from "./suite.js";

// Where a selection run reports as it goes, so a long run shows each result when it lands.
export type SelectionReporter = {
  // A progress or summary line.
  info(message: string): void;
  // A line explaining why the run cannot end green.
  error(message: string): void;
  // One skill's or one dependent fixture's eval result.
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
  withDependents?: boolean;
  evalOptions: SelectionEvalOptions;
  abortSignal?: AbortSignal;
  reporter: SelectionReporter;
};

// Runs the selection's suite on each agent in turn, then the dependent cases that route to it.
// Returns true only for a green run: false when a case failed, a fixture the dependents scan
// needed was unreadable, a suite ran no skill, or the run was aborted. An error that ends an eval
// ends the run and propagates.
export async function runSelection(options: SelectionRunOptions): Promise<boolean> {
  const { repoRoot, selection, reporter, abortSignal } = options;
  const aborted = () => abortSignal?.aborted === true;
  let ok = true;
  const { dependents, unreadableFixtures } =
    options.withDependents === true
      ? await findDependentFixtures(repoRoot, await listSelectedSkillPaths(repoRoot, selection))
      : { dependents: [], unreadableFixtures: [] };
  // A fixture the scan could not read may hold routing cases for the selection, so the run still
  // executes every discovered case but cannot end green.
  for (const unreadable of unreadableFixtures) {
    reporter.error(
      `ERROR: could not scan the fixture of ${unreadable.skillPath} for dependent cases, so the dependent set is incomplete: ${unreadable.message}`,
    );
    ok = false;
  }
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
  const { repoRoot, reporter, abortSignal } = options;
  const { runnable, skipped } = await selectDependentsForAgent(repoRoot, dependents, agent);
  for (const entry of skipped) {
    reporter.info(`Skipping dependent cases in ${entry.label} on ${agent}: ${entry.reason}.`);
  }
  const tally = { ran: 0, passed: 0 };
  let ok = true;
  for (const dependent of runnable) {
    if (abortSignal?.aborted === true) {
      break;
    }
    reporter.info(
      `Dependent cases in ${dependent.label} routing to ${dependent.routesTo.join(", ")}: ${dependent.caseIds.join(", ")}.`,
    );
    const result = await runTriggerEval({
      ...dependentRunOptions(options.evalOptions, dependent),
      repoRoot,
      agent,
      ...(abortSignal === undefined ? {} : { abortSignal }),
    });
    ok = record(reporter, tally, result) && ok;
  }
  if (tally.ran > 0) {
    reporter.info(`Dependent fixtures on ${agent}: ${tally.passed}/${tally.ran} passed.`);
  }
  return ok;
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
