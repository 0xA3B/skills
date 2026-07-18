import { describe, expect, it } from "vitest";

import { buildCliRunResult } from "./test-utils.js";
import type { CaseObservations } from "./types.js";
import { buildCaseResult, type CaseVerdictOptions, shouldStopEarly } from "./verdict.js";

const TARGET = "demo:auto-skill";

function observations(overrides: Partial<CaseObservations> = {}): CaseObservations {
  return {
    signal: "none",
    invokedSkills: [],
    hasActivity: true,
    decisionItemCount: 1,
    ...overrides,
  };
}

function verdictOptions(overrides: Partial<CaseVerdictOptions> = {}): CaseVerdictOptions {
  return {
    testCase: { id: "case-1", expect: "invoke" },
    targetLabel: TARGET,
    stagedSkillLabels: new Set([TARGET]),
    observations: observations(),
    runResult: buildCliRunResult(),
    durationMs: 10,
    ...overrides,
  };
}

function invokedObservations(...invokedSkills: string[]): CaseObservations {
  return observations({ signal: "stdout-skill-canary", invokedSkills });
}

describe("shouldStopEarly", () => {
  it("stops as soon as any invocation signal appears", () => {
    expect(shouldStopEarly(observations({ signal: "stdout-skill-canary" }))).toBe(true);
    expect(shouldStopEarly(observations({ signal: "stream-skill-tool-use" }))).toBe(true);
    expect(shouldStopEarly(observations({ signal: "stderr-skill-injected" }))).toBe(true);
  });

  it("stops at the decision-item budget and not before", () => {
    expect(shouldStopEarly(observations({ decisionItemCount: 4 }))).toBe(false);
    expect(shouldStopEarly(observations({ decisionItemCount: 5 }))).toBe(true);
  });
});

describe("buildCaseResult", () => {
  it("passes an invoke case when only the target fired", () => {
    const result = buildCaseResult(verdictOptions({ observations: invokedObservations(TARGET) }));

    expect(result).toMatchObject({
      caseId: "case-1",
      expect: "invoke",
      invocationSignal: "stdout-skill-canary",
      invoked: true,
      passed: true,
    });
    expect(result.wrongSkill).toBeUndefined();
    expect(result.skipSignal).toBeUndefined();
  });

  it("passes a skip case even when the CLI reported an error", () => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "skip-case", expect: "skip" },
        runResult: buildCliRunResult({ exitCode: 1, error: "codex exec exited with code 1." }),
      }),
    );

    expect(result).toMatchObject({
      caseId: "skip-case",
      invoked: false,
      passed: true,
      error: "codex exec exited with code 1.",
    });
  });

  it("fails an invoke case when only a wrong skill fired", () => {
    const result = buildCaseResult(
      verdictOptions({ observations: invokedObservations("demo:sibling-skill") }),
    );

    expect(result).toMatchObject({
      invoked: false,
      wrongSkill: "demo:sibling-skill",
      passed: false,
    });
    expect(result.skipSignal).toBeUndefined();
    expect(result.environmentalFailure).toBeUndefined();
  });

  it("fails an invoke case when the target and a sibling fire together", () => {
    // Simultaneous firing is trigger-contract overlap: the target invocation must not mask the
    // sibling's.
    const result = buildCaseResult(
      verdictOptions({ observations: invokedObservations(TARGET, "demo:sibling-skill") }),
    );

    expect(result).toMatchObject({
      invoked: true,
      wrongSkill: "demo:sibling-skill",
      passed: false,
    });
    expect(result.environmentalFailure).toBeUndefined();
  });

  it("passes a skip case with an informational wrong skill", () => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "skip-case", expect: "skip" },
        observations: invokedObservations("demo:sibling-skill"),
      }),
    );

    expect(result).toMatchObject({
      invoked: false,
      wrongSkill: "demo:sibling-skill",
      passed: true,
    });
  });

  it("never credits the target from a prefix-named impostor label", () => {
    const result = buildCaseResult(
      verdictOptions({
        observations: observations({
          signal: "stream-skill-tool-use",
          invokedSkills: ["demo:auto-skill-extra"],
        }),
      }),
    );

    expect(result).toMatchObject({
      invoked: false,
      wrongSkill: "demo:auto-skill-extra",
      passed: false,
    });
  });

  it("classifies skip signals from how the run ended", () => {
    const skipCase = { id: "skip-case", expect: "skip" as const };
    const byEnd = (endedBy: "completed" | "stop-when" | "timeout" | "abort") =>
      buildCaseResult(
        verdictOptions({ testCase: skipCase, runResult: buildCliRunResult({ endedBy }) }),
      );

    expect(byEnd("completed")).toMatchObject({ passed: true, skipSignal: "completed" });
    expect(byEnd("stop-when")).toMatchObject({ passed: true, skipSignal: "item-budget" });
    expect(byEnd("timeout")).toMatchObject({ passed: true, skipSignal: "timeout" });
    expect(byEnd("abort").skipSignal).toBeUndefined();
  });

  it("reports an environmental failure instead of a skip when sandbox_apply is refused", () => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "skip-case", expect: "skip" },
        observations: observations({ hasActivity: false, decisionItemCount: 0 }),
        runResult: buildCliRunResult({
          exitCode: 1,
          stderr: "sandbox-exec: sandbox_apply: Operation not permitted",
        }),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.environmentalFailure).toContain("sandbox_apply: Operation not permitted");
  });

  it("reports an environmental failure when a run produced no agent output", () => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "skip-case", expect: "skip" },
        observations: observations({ hasActivity: false, decisionItemCount: 0 }),
        runResult: buildCliRunResult({ exitCode: 1, stderr: "codex: unable to authenticate" }),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.environmentalFailure).toContain("no agent output");
    expect(result.environmentalFailure).toContain("codex: unable to authenticate");
  });

  it("trusts stop-when and abort endings without agent activity", () => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "skip-case", expect: "skip" },
        observations: observations({ hasActivity: false, decisionItemCount: 0 }),
        runResult: buildCliRunResult({ endedBy: "stop-when" }),
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.environmentalFailure).toBeUndefined();
  });

  it("accepts staged skills and the exempt set in the loaded-skills observation", () => {
    const result = buildCaseResult(
      verdictOptions({
        stagedSkillLabels: new Set([TARGET, "demo:manual-skill"]),
        observations: {
          ...invokedObservations(TARGET),
          loadedSkills: [TARGET, "demo:manual-skill", "doctor"],
        },
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.environmentalFailure).toBeUndefined();
  });

  it("fails environmentally when unstaged skills leak in, even on a matched invoke", () => {
    // The leak poisons the case in both directions, so it overrides a matched expectation.
    const result = buildCaseResult(
      verdictOptions({
        observations: {
          ...invokedObservations(TARGET),
          loadedSkills: [TARGET, "code-review", "doctor"],
        },
      }),
    );

    expect(result.invoked).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.environmentalFailure).toContain("code-review");
    expect(result.environmentalFailure).toContain("disableBundledSkills");
  });

  it("skips the isolation check when no loaded-skills observation exists", () => {
    const result = buildCaseResult(verdictOptions({ observations: invokedObservations(TARGET) }));

    expect(result.passed).toBe(true);
  });
});
