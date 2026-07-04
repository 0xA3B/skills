import path from "node:path";

import { skillTargetLabel } from "./target.js";
import type { TriggerEvalResult } from "./types.js";

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
    const status = caseResult.passed ? "PASS" : "FAIL";
    const actual = caseResult.invoked ? "invoke" : "skip";
    const signal = caseResult.invoked ? ` via ${caseResult.invocationSignal}` : "";
    console.log(
      `- ${status} ${caseResult.caseId}: expected ${caseResult.expect}, observed ${actual}${signal} (${formatDuration(caseResult.durationMs)})`,
    );
    if (caseResult.error !== undefined) {
      console.log(`  error: ${caseResult.error}`);
    }
  }

  console.log(`Report written to ${path.relative(process.cwd(), result.reportPath)}.`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}
