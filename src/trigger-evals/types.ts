import type { PluginTarget, Skill } from "../skills/index.js";
import type { TriggerExpectation } from "./fixtures/index.js";

export type TriggerEvalAgent = PluginTarget;

export type InvocationSignal =
  | "stderr-skill-injected"
  | "stdout-skill-canary"
  | "command-skill-read"
  | "stream-skill-tool-use"
  | "none";

// Normalized observations parsed from one case's raw CLI output. Lanes produce these; verdict
// classification consumes them without knowing any agent's stream format.
export type CaseObservations = {
  signal: InvocationSignal;
  // Labels of skills whose invocation was detected, in detection order. May name skills other
  // than the target; attribution to target vs wrong skill happens in the verdict.
  invokedSkills: string[];
  hasActivity: boolean;
  // Lane-specific events that show the agent moved beyond reasoning or typed reconnaissance toward
  // a response or action. This is not a raw stream-event count.
  decisionItemCount: number;
  // Skills the agent reported loading at session start (Claude's init event); undefined when the
  // lane has no such signal.
  loadedSkills?: string[];
  // The agent runtime's own report that the turn failed (an API error, a dropped stream), quoted
  // from the lane's terminal error event. Such a run never reached a settled trigger decision.
  errorSignal?: string;
  // True while a skill-file read is the latest signal and no assistant message has completed
  // since: the agent may still be loading further skills before it speaks, so the invocation set
  // is not yet attributable. Lanes without a read signal leave it undefined.
  pendingReads?: boolean;
};

export type TriggerCaseResult = {
  caseId: string;
  expect: TriggerExpectation;
  // The case's routing assertion, copied from the fixture so reports can show the expectation.
  invokeInstead?: string;
  invocationSignal: InvocationSignal;
  // True when the target skill was invoked, regardless of whether another staged skill also
  // fired; simultaneous firings are recorded separately in wrongSkill.
  invoked: boolean;
  // Every distinct staged skill whose invocation was detected, in detection order, minus the
  // dependency loads below.
  invokedSkills: string[];
  // Detected skills the verdict attributed to another detected skill's workflow because that
  // skill's body names them (dropDependencyLoads). Kept for the report; they carry no decision.
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
  durationMs: number;
  exitCode: number | null;
  finalMessagePath: string;
  stdoutPath: string;
  stderrPath: string;
  error?: string;
};

export type TriggerEvalResult = {
  runDir: string;
  reportPath: string;
  target: Skill;
  agent: TriggerEvalAgent;
  durationMs: number;
  results: TriggerCaseResult[];
  skippedReason?: string;
  // Runtime directories the run could not remove, one message each. Reported, never fatal.
  cleanupFailures?: string[];
};
