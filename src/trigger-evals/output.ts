import path from "node:path";

import { formatSkillLabel } from "../skills/index.js";
import type { TriggerEvalResult } from "./runner.js";
import type { TriggerCaseResult } from "./verdict.js";

export function printTriggerEvalResult(result: TriggerEvalResult): void {
  if (result.skippedReason !== undefined) {
    console.warn(`WARNING: ${result.skippedReason}`);
    console.warn(`Report written to ${path.relative(process.cwd(), result.reportPath)}.`);
    return;
  }

  const cases = groupAttemptsByCase(result.results);
  const passedCases = cases.filter((attempts) => attempts.every((attempt) => attempt.passed));
  console.log(
    `Trigger eval completed for ${formatSkillLabel(result.target)} on ${result.agent}: ${passedCases.length}/${cases.length} passed in ${formatDuration(result.durationMs)}.`,
  );
  const model =
    result.resolvedModel === undefined
      ? result.model
      : `${result.model} resolved to ${result.resolvedModel}`;
  console.log(
    `Agent: ${result.agentVersion ?? result.agent}, model ${model}, effort ${result.effort}.`,
  );

  for (const attempts of cases) {
    for (const line of formatCaseLines(attempts)) {
      console.log(line);
    }
  }

  console.log(`Report written to ${path.relative(process.cwd(), result.reportPath)}.`);
  // A leftover runtime directory is a disk-hygiene problem, not an eval result: warn, keep going.
  for (const cleanupFailure of result.cleanupFailures ?? []) {
    console.warn(`WARNING: runtime cleanup left ${cleanupFailure}`);
  }
}

// Results arrive case-major (every attempt of a case before the next case), so a case's attempts
// are one consecutive run.
function groupAttemptsByCase(results: TriggerCaseResult[]): TriggerCaseResult[][] {
  const cases: TriggerCaseResult[][] = [];
  for (const attempt of results) {
    const current = cases.at(-1);
    if (current?.[0]?.caseId === attempt.caseId) {
      current.push(attempt);
    } else {
      cases.push([attempt]);
    }
  }
  return cases;
}

// One case: a status line with the attempt tally and the fixture's expectation, then one line per
// attempt with what was observed and any environment or execution error beneath it. The case
// passes only when every attempt passed; a genuine FAIL outranks an environmental ERROR.
export function formatCaseLines(attempts: TriggerCaseResult[]): string[] {
  const [first] = attempts;
  if (first === undefined) {
    return [];
  }
  const statuses = attempts.map(attemptStatus);
  const status = statuses.includes("FAIL") ? "FAIL" : statuses.includes("ERROR") ? "ERROR" : "PASS";
  const passed = statuses.filter((value) => value === "PASS").length;
  const errors = statuses.filter((value) => value === "ERROR").length;
  const tally = `${passed}/${attempts.length} passed${errors === 0 ? "" : ` (${errors} error${errors === 1 ? "" : "s"})`}`;
  const expected =
    first.invokeInstead === undefined
      ? first.expect
      : `${first.expect} with invoke-instead ${first.invokeInstead}`;

  const lines = [`- ${status} ${first.caseId}: ${tally}, expected ${expected}`];
  for (const attempt of attempts) {
    const dependencyLoads =
      attempt.dependencyLoads === undefined
        ? ""
        : `; dependency loads ${attempt.dependencyLoads.join(", ")}`;
    lines.push(
      `  attempt ${attempt.attempt} ${attemptStatus(attempt)}: observed ${formatObserved(attempt)}${dependencyLoads} (${formatDuration(attempt.durationMs)})`,
    );
    if (attempt.environmentalFailure !== undefined) {
      lines.push(`    environment: ${attempt.environmentalFailure}`);
    }
    if (attempt.error !== undefined) {
      lines.push(`    error: ${attempt.error}`);
    }
  }
  return lines;
}

function attemptStatus(attempt: TriggerCaseResult): "PASS" | "FAIL" | "ERROR" {
  if (attempt.passed) {
    return "PASS";
  }
  return attempt.environmentalFailure === undefined ? "FAIL" : "ERROR";
}

function formatObserved(caseResult: TriggerCaseResult): string {
  if (caseResult.invoked) {
    // A wrong skill firing alongside the target is trigger-contract overlap, so it is named even
    // though the target invocation was also observed.
    return caseResult.wrongSkill === undefined
      ? `invoke via ${caseResult.invocationSignal}`
      : `invoke plus wrong-skill ${caseResult.wrongSkill} via ${caseResult.invocationSignal}`;
  }
  // A different staged skill fired: a distinct failure on invoke cases, and worth surfacing even
  // on passing skip cases because it exposes trigger-contract overlap. On a routing assertion the
  // expected alternate is named as such, and any other skill that fired with it is listed so a
  // failed assertion is explainable from the line.
  if (caseResult.wrongSkill !== undefined) {
    const alternate = caseResult.invokeInstead;
    if (alternate === undefined || !caseResult.invokedSkills.includes(alternate)) {
      return `wrong-skill ${caseResult.wrongSkill} via ${caseResult.invocationSignal}`;
    }
    const others = caseResult.invokedSkills.filter((label) => label !== alternate);
    const suffix = others.length === 0 ? "" : ` plus wrong-skill ${others.join(", ")}`;
    return `alternate ${alternate}${suffix} via ${caseResult.invocationSignal}`;
  }

  return formatSkip(caseResult.skipSignal);
}

function formatSkip(skipSignal: "completed" | "item-budget" | "timeout" | undefined): string {
  if (skipSignal === "item-budget") {
    return "skip via item-budget";
  }
  if (skipSignal === "timeout") {
    return "skip via timeout (weak signal)";
  }

  return "skip";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}
