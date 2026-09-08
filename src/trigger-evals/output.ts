import path from "node:path";

import { skillTargetLabel } from "./target.js";
import type { TriggerCaseResult, TriggerEvalResult } from "./types.js";

export function printTriggerEvalResult(result: TriggerEvalResult): void {
  if (result.skippedReason !== undefined) {
    console.warn(`WARNING: ${result.skippedReason}`);
    console.warn(`Report written to ${path.relative(process.cwd(), result.reportPath)}.`);
    return;
  }

  const failures = result.results.filter((caseResult) => !caseResult.passed);
  console.log(
    `Trigger eval completed for ${skillTargetLabel(result.target)} on ${result.agent}: ${result.results.length - failures.length}/${result.results.length} passed in ${formatDuration(result.durationMs)}.`,
  );

  for (const caseResult of result.results) {
    console.log(formatCaseLine(caseResult));
    if (caseResult.environmentalFailure !== undefined) {
      console.log(`  environment: ${caseResult.environmentalFailure}`);
    }
    if (caseResult.error !== undefined) {
      console.log(`  error: ${caseResult.error}`);
    }
  }

  console.log(`Report written to ${path.relative(process.cwd(), result.reportPath)}.`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

// One result line: status, case id, the fixture's expectation, and what was observed.
export function formatCaseLine(caseResult: TriggerCaseResult): string {
  const status = caseResult.passed
    ? "PASS"
    : caseResult.environmentalFailure === undefined
      ? "FAIL"
      : "ERROR";
  const expected =
    caseResult.invokeInstead === undefined
      ? caseResult.expect
      : `${caseResult.expect} with invoke-instead ${caseResult.invokeInstead}`;
  return `- ${status} ${caseResult.caseId}: expected ${expected}, observed ${formatObserved(caseResult)} (${formatDuration(caseResult.durationMs)})`;
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
