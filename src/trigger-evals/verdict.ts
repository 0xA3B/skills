import type { CliRunResult } from "./exec.js";
import type { CaseObservations, TriggerCaseResult, TriggerExpectation } from "./types.js";

// The trigger decision happens at the front of the turn, so once this many substantive items
// (agent messages, command executions — not reasoning) complete without an invocation signal, the
// run is stopped and classified as a clean skip instead of waiting for the full workflow or the
// case timeout. Observed invocations surface the canary within about three items, so five keeps
// late invocations safe while cutting long skip runs short.
export const SKIP_DECISION_ITEM_BUDGET = 5;

// Any invocation — target or wrong skill — settles the trigger decision, so the run stops.
export function shouldStopEarly(observations: CaseObservations): boolean {
  return (
    observations.signal !== "none" || observations.decisionItemCount >= SKIP_DECISION_ITEM_BUDGET
  );
}

export type CaseVerdictOptions = {
  testCase: { id: string; expect: TriggerExpectation };
  targetLabel: string;
  // Every staged skill's label regardless of invocation policy, for the isolation check.
  stagedSkillLabels: ReadonlySet<string>;
  observations: CaseObservations;
  runResult: CliRunResult;
  durationMs: number;
};

export function buildCaseResult(options: CaseVerdictOptions): TriggerCaseResult {
  const { observations, runResult, testCase } = options;
  const anyInvocation = observations.signal !== "none";
  const invoked = observations.invokedSkills.includes(options.targetLabel);
  const wrongSkill = observations.invokedSkills.find((label) => label !== options.targetLabel);
  // A wrong-skill invocation fails an invoke case even when the target also fired — simultaneous
  // firing is trigger-contract overlap, the very thing the eval exists to expose. It does not fail
  // a skip case: the fixture only encodes expectations about the target, and a sibling firing on a
  // target-negative prompt may be exactly right. It is still recorded in wrongSkill.
  const matchedExpectation =
    testCase.expect === "invoke" ? invoked && wrongSkill === undefined : !invoked;
  const endedBy = runResult.endedBy ?? "completed";
  // Isolation leaks poison the case in both directions — an unstaged skill can steal an invoke or
  // provoke one — so the check applies even when the target fired. Other environmental checks only
  // apply when no skill fired, because any observed invocation proves the run executed.
  const isolationFailure = detectSkillIsolationFailure(observations, options.stagedSkillLabels);
  const environmentalFailure =
    isolationFailure ??
    (anyInvocation ? undefined : detectEnvironmentalFailure(runResult, endedBy, observations));
  const skipSignal = anyInvocation ? undefined : classifySkipSignal(endedBy);
  const passed = environmentalFailure === undefined && matchedExpectation;
  return {
    caseId: testCase.id,
    expect: testCase.expect,
    invocationSignal: observations.signal,
    invoked,
    ...(wrongSkill === undefined ? {} : { wrongSkill }),
    passed,
    ...(skipSignal === undefined ? {} : { skipSignal }),
    ...(environmentalFailure === undefined ? {} : { environmentalFailure }),
    durationMs: options.durationMs,
    exitCode: runResult.exitCode,
    finalMessagePath: runResult.finalMessagePath,
    stdoutPath: runResult.stdoutPath,
    stderrPath: runResult.stderrPath,
    ...(runResult.error === undefined ? {} : { error: runResult.error }),
  };
}

// A skip verdict is only trustworthy when the agent demonstrably ran: a case whose subprocess died
// before producing any agent output would otherwise read as a clean skip and mask an environment
// problem (bad auth, blocked network, sandbox nesting) as a trigger miss. Only checked when no
// invocation signal was observed, because an observed signal proves the run actually executed.
// The sandbox_apply marker is an OS-level (macOS Seatbelt) failure that leaves the agent alive but
// unable to execute any command, so it is checked separately from the dead-run case.
function detectEnvironmentalFailure(
  runResult: { stderr: string },
  endedBy: string,
  observations: CaseObservations,
): string | undefined {
  if (runResult.stderr.includes("sandbox_apply: Operation not permitted")) {
    return (
      "sandbox_apply: Operation not permitted — case subprocesses could not apply their OS " +
      "sandbox (macOS refuses to nest Seatbelt sandboxes), so no command ran. Run trigger evals " +
      "from an unsandboxed context."
    );
  }

  if (endedBy !== "stop-when" && endedBy !== "abort" && !observations.hasActivity) {
    const stderrHint = firstNonEmptyLine(runResult.stderr);
    return (
      "the run produced no agent output, so the case cannot be classified as a skip." +
      (stderrHint === undefined ? " Check the case stderr log." : ` stderr: ${stderrHint}`)
    );
  }

  return undefined;
}

// Bundled skills Claude Code loads even when disableBundledSkills is honored (observed on
// 2.1.210). Extend when a new Claude version exempts more skills from the setting.
const DISABLE_BUNDLED_SKILLS_EXEMPT = new Set(["doctor"]);

// The loaded-skills observation lists every skill the agent reported loading: plugin skills as
// <plugin>:<skill>, project and bundled skills as bare names. With staging honored, only staged
// skills (plus the exempt set) appear; anything else means the isolation the eval depends on did
// not hold — an unstaged skill can steal an invoke or provoke one — so the verdict cannot be
// trusted in either direction. Lanes without a loaded-skills signal skip the check.
function detectSkillIsolationFailure(
  observations: CaseObservations,
  stagedSkillLabels: ReadonlySet<string>,
): string | undefined {
  if (observations.loadedSkills === undefined) {
    return undefined;
  }

  const unexpected = observations.loadedSkills.filter(
    (skill) => !stagedSkillLabels.has(skill) && !DISABLE_BUNDLED_SKILLS_EXEMPT.has(skill),
  );
  if (unexpected.length === 0) {
    return undefined;
  }

  return (
    `unstaged skills loaded despite disableBundledSkills: ${unexpected.join(", ")} — the run was ` +
    "not isolated, so the verdict is not trustworthy. Check the Claude version's " +
    "disableBundledSkills support, or extend the exempt list if a new bundled skill ignores the " +
    "setting."
  );
}

function classifySkipSignal(endedBy: string): "completed" | "item-budget" | "timeout" | undefined {
  if (endedBy === "completed") {
    return "completed";
  }
  if (endedBy === "stop-when") {
    return "item-budget";
  }
  if (endedBy === "timeout") {
    return "timeout";
  }

  return undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}
