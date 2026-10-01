import type { PluginTarget, Skill } from "../skills/index.js";
import type { TriggerExpectation } from "./fixtures/index.js";
import type { InvocationSignal } from "./lanes/index.js";

export type TriggerEvalAgent = PluginTarget;

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
