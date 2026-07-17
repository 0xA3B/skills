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
    const status = caseResult.passed
      ? "PASS"
      : caseResult.environmentalFailure === undefined
        ? "FAIL"
        : "ERROR";
    const observed = formatObserved(caseResult);
    console.log(
      `- ${status} ${caseResult.caseId}: expected ${caseResult.expect}, observed ${observed} (${formatDuration(caseResult.durationMs)})`,
    );
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

function formatObserved(caseResult: TriggerCaseResult): string {
  if (caseResult.invoked) {
    // A wrong skill firing alongside the target is trigger-contract overlap, so it is named even
    // though the target invocation was also observed.
    return caseResult.wrongSkill === undefined
      ? `invoke via ${caseResult.invocationSignal}`
      : `invoke plus wrong-skill ${caseResult.wrongSkill} via ${caseResult.invocationSignal}`;
  }
  // A different staged skill fired: a distinct failure on invoke cases, and worth surfacing even
  // on passing skip cases because it exposes trigger-contract overlap.
  if (caseResult.wrongSkill !== undefined) {
    return `wrong-skill ${caseResult.wrongSkill} via ${caseResult.invocationSignal}`;
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
