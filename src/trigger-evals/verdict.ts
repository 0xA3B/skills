import disableBundledSkillsExempt from "./disable-bundled-skills-exempt.json" with { type: "json" };
import type { TriggerExpectation } from "./fixtures/index.js";
import type { CaseObservations, CliRunResult, InvocationSignal } from "./lanes/index.js";

// The verdict on one attempt of a case.
export type TriggerCaseResult = {
  caseId: string;
  // Which attempt of the case this is, from 1.
  attempt: number;
  expect: TriggerExpectation;
  // The case's routing assertion, copied from the fixture so reports can show the expectation.
  invokeInstead?: string;
  invocationSignal: InvocationSignal;
  // True when the target skill was invoked, regardless of whether another staged skill also
  // fired; simultaneous firings are recorded separately in wrongSkill.
  invoked: boolean;
  // Every distinct staged skill in the trigger decision, in detection order, minus the dependency
  // loads below.
  invokedSkills: string[];
  // Detected skills the verdict attributed to another detected skill's workflow because that
  // skill applies them (dropDependencyLoads). Kept for the report; they carry no decision.
  dependencyLoads?: string[];
  // Label of a non-target staged skill whose invocation was detected. Fails an invoke case even
  // when the target also fired (simultaneous invocation is trigger-contract overlap); surfaced
  // informationally on skip cases.
  wrongSkill?: string;
  passed: boolean;
  // How a skip verdict was reached: the run finished naturally, was stopped at the decision-item
  // budget, or was cut off by the case timeout (a weak signal — the model might have invoked
  // later). Absent on invoked cases and on runs that ended by abort or spawn failure.
  skipSignal?: "completed" | "item-budget" | "timeout";
  environmentalFailure?: string;
  // The model the agent reported answering with and the agent CLI version, when the lane reads
  // them from each case's output (Claude).
  resolvedModel?: string;
  agentVersion?: string;
  durationMs: number;
  exitCode: number | null;
  finalMessagePath: string;
  stdoutPath: string;
  stderrPath: string;
  error?: string;
};

// The trigger decision happens near the front of the turn, so once this many decision-bearing items
// complete without an invocation signal, the run is stopped and classified as a clean skip instead
// of waiting for the full workflow or the case timeout. Lanes exclude reasoning and any structured
// reconnaissance they can identify. Observed invocations surface within about three such items, so
// five keeps late invocations safe while cutting long skip runs short. A lane whose items include
// reconnaissance it cannot identify sets its own budget on LaneRun.skipDecisionItemBudget.
export const SKIP_DECISION_ITEM_BUDGET = 5;

// The first invocation signal — target or wrong skill — is the trigger decision, so the run stops
// there. Codex once waited for its next message so a helper read before the workflow skill would
// be attributed, but no recorded run read a helper first, and the wait counted skills a workflow
// read as data as second firings.
export function shouldStopEarly(
  observations: CaseObservations,
  skipDecisionItemBudget: number = SKIP_DECISION_ITEM_BUDGET,
): boolean {
  return observations.signal !== "none" || observations.decisionItemCount >= skipDecisionItemBudget;
}

export type CaseVerdictOptions = {
  testCase: { id: string; expect: TriggerExpectation; invokeInstead?: string };
  attempt: number;
  targetLabel: string;
  // Every staged skill's label regardless of invocation policy, for the isolation check.
  stagedSkillLabels: ReadonlySet<string>;
  // For each staged skill, the skills it applies (LaneRun.skillDependencies).
  skillDependencies?: ReadonlyMap<string, ReadonlySet<string>>;
  observations: CaseObservations;
  runResult: CliRunResult;
  durationMs: number;
};

// Drops every detected skill that another detected skill applies: the agent loaded it while
// applying that skill, so it is a dependency load, not a separate invocation. Read order does not
// decide, because one command can name the helper before the workflow skill. Two skills that
// apply each other both keep their decisions, and a longer cycle that would drop every detected
// skill keeps them all, so an observed invocation never reports no skill at all.
export function dropDependencyLoads(
  invokedSkills: readonly string[],
  skillDependencies: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const names = (skillLabel: string, other: string) =>
    skillDependencies.get(skillLabel)?.has(other) ?? false;
  const kept = invokedSkills.filter(
    (skillLabel) =>
      !invokedSkills.some(
        (other) => other !== skillLabel && names(other, skillLabel) && !names(skillLabel, other),
      ),
  );
  return kept.length === 0 && invokedSkills.length > 0 ? [...invokedSkills] : kept;
}

export function buildCaseResult(options: CaseVerdictOptions): TriggerCaseResult {
  const { observations, runResult, testCase } = options;
  const anyInvocation = observations.signal !== "none";
  // Lanes may report one label per detection event, so the same skill can appear twice.
  const detectedSkills = [...new Set(observations.invokedSkills)];
  const invokedSkills = dropDependencyLoads(detectedSkills, options.skillDependencies ?? new Map());
  // The dropped loads stay on the result so a report can show that a file was read even though
  // the verdict attributed the read to another skill's workflow.
  const dependencyLoads = detectedSkills.filter((label) => !invokedSkills.includes(label));
  const invoked = invokedSkills.includes(options.targetLabel);
  const wrongSkill = invokedSkills.find((label) => label !== options.targetLabel);
  // A wrong-skill invocation fails an invoke case even when the target also fired — simultaneous
  // firing is trigger-contract overlap, the very thing the eval exists to expose. It does not fail
  // a skip case: the fixture only encodes expectations about the target, and a sibling firing on a
  // target-negative prompt may be exactly right. It is still recorded in wrongSkill.
  // A routing assertion tightens a skip case: the target must not fire and the named alternate
  // must be the only skill that fires. Nothing firing, a different skill, or the target alongside
  // the alternate all fail. The explicit !invoked keeps a label equal to the target from passing.
  // "Only" is bounded by the trigger decision: the run stops at the first invocation signal, and a
  // later firing is workflow behavior. A Claude message's later Skill blocks count only when they
  // reach the output before the stop takes effect. Invoke cases carry the same bound for
  // wrong-skill detection.
  const matchedExpectation =
    testCase.expect === "invoke"
      ? invoked && wrongSkill === undefined
      : testCase.invokeInstead === undefined
        ? !invoked
        : !invoked && invokedSkills.length === 1 && invokedSkills[0] === testCase.invokeInstead;
  const endedBy = runResult.endedBy ?? "completed";
  // Isolation leaks and unclassified skill-file access poison the case in both directions — an
  // unstaged skill can steal an invoke or provoke one, and an unclassified command may or may not
  // have loaded a skill — so those checks apply even when the target fired. Other environmental
  // checks only apply when no skill fired, because any observed invocation proves the run executed.
  const environmentalFailure =
    detectSkillIsolationFailure(observations, options.stagedSkillLabels) ??
    detectUnclassifiedSkillAccess(observations) ??
    (anyInvocation ? undefined : detectEnvironmentalFailure(runResult, endedBy, observations));
  const skipSignal = anyInvocation ? undefined : classifySkipSignal(endedBy);
  const passed = environmentalFailure === undefined && matchedExpectation;
  return {
    caseId: testCase.id,
    attempt: options.attempt,
    expect: testCase.expect,
    ...(testCase.invokeInstead === undefined ? {} : { invokeInstead: testCase.invokeInstead }),
    invocationSignal: observations.signal,
    invoked,
    invokedSkills,
    ...(dependencyLoads.length === 0 ? {} : { dependencyLoads }),
    ...(wrongSkill === undefined ? {} : { wrongSkill }),
    passed,
    ...(skipSignal === undefined ? {} : { skipSignal }),
    ...(environmentalFailure === undefined ? {} : { environmentalFailure }),
    ...(observations.resolvedModel === undefined
      ? {}
      : { resolvedModel: observations.resolvedModel }),
    ...(observations.agentVersion === undefined ? {} : { agentVersion: observations.agentVersion }),
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
// unable to execute any command, so it is checked separately from the dead-run case. A runtime
// error signal is the third case: the agent produced events, but its own runtime reported that the
// turn failed, so the decision the events show was never settled. Checked before the dead-run case
// so the report quotes the runtime's text when both apply.
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

  // Only a run the runtime ended on its own can blame the runtime: when the harness stopped the
  // run (budget, timeout, abort), some Claude Code versions answer the SIGTERM with an is_error
  // result, and that reflects the stop, not a failed turn.
  if (endedBy === "completed" && observations.errorSignal !== undefined) {
    return (
      "the agent runtime reported an error, so the run never settled a trigger decision. " +
      `error: ${observations.errorSignal}`
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

// Bundled skills Claude Code loads even when disableBundledSkills is honored: doctor (observed on
// 2.1.210) and plugin-authoring (added in 2.1.286). Extend when a new Claude version exempts more
// skills from the setting. An exempt skill that fires is still reported as a wrong skill. The list
// is a JSON file because the pressure-test-skill comparison script reads the same list.
const DISABLE_BUNDLED_SKILLS_EXEMPT: ReadonlySet<string> = new Set(disableBundledSkillsExempt);

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

function detectUnclassifiedSkillAccess(observations: CaseObservations): string | undefined {
  if (observations.unclassifiedSkillAccess === undefined) {
    return undefined;
  }

  return (
    "a command named a staged skill file in a form the lane cannot classify as a load or an " +
    "inspection, so the verdict is not trustworthy. Teach the lane's read matcher the form. " +
    `command: ${observations.unclassifiedSkillAccess}`
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
