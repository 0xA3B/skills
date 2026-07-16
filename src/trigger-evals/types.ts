export type TriggerExpectation = "invoke" | "skip";

export type TriggerEvalAgent = "claude" | "codex";

export type TriggerCase = {
  id: string;
  prompt: string;
  expect: TriggerExpectation;
  rationale?: string;
  workspaceFiles?: Record<string, string>;
};

export type TriggerFixture = {
  version: 1;
  cases: TriggerCase[];
};

type SkillTargetBase = {
  repoRoot: string;
  skillName: string;
  skillPath: string;
  skillFilePath: string;
  metadataPath: string;
  fixturePath: string;
};

export type PluginSkillTarget = SkillTargetBase & {
  kind: "plugin";
  pluginName: string;
  pluginPath: string;
};

export type RepoLocalSkillTarget = SkillTargetBase & {
  kind: "repo-local";
};

export type SkillTarget = PluginSkillTarget | RepoLocalSkillTarget;

export type InvocationSignal =
  | "stderr-skill-injected"
  | "stdout-skill-canary"
  | "stream-skill-tool-use"
  | "none";

export type TriggerCaseResult = {
  caseId: string;
  expect: TriggerExpectation;
  invocationSignal: InvocationSignal;
  // True only when the target skill was invoked. A different staged skill firing instead leaves
  // this false and names that skill in invokedSkill.
  invoked: boolean;
  // Label of the skill whose invocation was detected, when any skill fired: the target label when
  // invoked is true, or the wrong skill's label when the prompt routed elsewhere.
  invokedSkill?: string;
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
  target: SkillTarget;
  agent: TriggerEvalAgent;
  durationMs: number;
  results: TriggerCaseResult[];
  skippedReason?: string;
};
