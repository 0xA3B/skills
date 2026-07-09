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

export type TriggerCaseResult = {
  caseId: string;
  expect: TriggerExpectation;
  invocationSignal:
    | "stderr-skill-injected"
    | "stdout-skill-canary"
    | "stream-skill-tool-use"
    | "none";
  invoked: boolean;
  passed: boolean;
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
