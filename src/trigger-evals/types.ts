export type TriggerExpectation = "invoke" | "skip";

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

export type SkillTarget = {
  repoRoot: string;
  pluginName: string;
  skillName: string;
  pluginPath: string;
  skillPath: string;
  skillFilePath: string;
  metadataPath: string;
  fixturePath: string;
};

export type TriggerCaseResult = {
  caseId: string;
  expect: TriggerExpectation;
  invocationSignal: "stderr-skill-injected" | "none";
  invoked: boolean;
  passed: boolean;
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
  results: TriggerCaseResult[];
  skippedReason?: string;
};
