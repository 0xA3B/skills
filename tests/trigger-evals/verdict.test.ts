import { describe, expect, it } from "vitest";

import type { CaseObservations, CliRunResult } from "../../src/trigger-evals/lanes/index.js";
import {
  buildCaseResult,
  type CaseVerdictOptions,
  SKIP_DECISION_ITEM_BUDGET,
  dropDependencyLoads,
  shouldStopEarly,
} from "../../src/trigger-evals/verdict.js";
import { buildCliRunResult } from "./test-utils.js";

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
  it.each<[string, Partial<CaseObservations>, number | undefined, boolean]>([
    ["stops on a canary signal", { signal: "stdout-skill-canary" }, undefined, true],
    ["stops on a skill tool use", { signal: "stream-skill-tool-use" }, undefined, true],
    ["stops on a skill injection", { signal: "stderr-skill-injected" }, undefined, true],
    ["stops on a skill-file read", { signal: "command-skill-read" }, undefined, true],
    [
      "stops on a settled skill-file read",
      { signal: "command-skill-read", pendingReads: false },
      undefined,
      true,
    ],
    [
      "keeps streaming while a skill-file read has not settled at an assistant message",
      { signal: "command-skill-read", pendingReads: true },
      undefined,
      false,
    ],
    [
      "stops an unsettled skill-file read at the decision-item budget",
      {
        signal: "command-skill-read",
        pendingReads: true,
        decisionItemCount: SKIP_DECISION_ITEM_BUDGET,
      },
      undefined,
      true,
    ],
    ["keeps streaming below the decision-item budget", { decisionItemCount: 4 }, undefined, false],
    ["stops at the decision-item budget", { decisionItemCount: 5 }, undefined, true],
    // A lane can raise the budget when its items include reconnaissance it cannot separate.
    ["keeps streaming below a lane-raised budget", { decisionItemCount: 5 }, 8, false],
    ["stops at a lane-raised budget", { decisionItemCount: 8 }, 8, true],
  ])("%s", (_name, caseObservations, budget, expected) => {
    expect(shouldStopEarly(observations(caseObservations), budget)).toBe(expected);
  });
});

describe("dropDependencyLoads", () => {
  // Recorded 2026-09-24 on gpt-6-sol: "Use Claude Code with sonnet to review these changes" read
  // adversarial-review, whose body names using-claude-cli for CLI mechanics, and then read
  // using-claude-cli. Only the first read is a trigger decision.
  const dependencies = new Map<string, ReadonlySet<string>>([
    ["claude-in-codex:adversarial-review", new Set(["claude-in-codex:using-claude-cli"])],
    ["claude-in-codex:using-claude-cli", new Set(["writing:agent-instructions"])],
    ["writing:agent-instructions", new Set()],
  ]);
  const mutual = new Map<string, ReadonlySet<string>>([
    ["a", new Set(["b"])],
    ["b", new Set(["a"])],
  ]);
  const cycle = new Map<string, ReadonlySet<string>>([
    ["a", new Set(["b"])],
    ["b", new Set(["c"])],
    ["c", new Set(["a"])],
  ]);

  it.each<[string, string[], ReadonlyMap<string, ReadonlySet<string>>, string[]]>([
    [
      "drops a skill loaded after the skill whose body names it",
      ["claude-in-codex:adversarial-review", "claude-in-codex:using-claude-cli"],
      dependencies,
      ["claude-in-codex:adversarial-review"],
    ],
    [
      // An agent that announced a workflow may read the helper it names first: recorded
      // 2026-09-24 on gpt-6-sol, where git:create-pr read technical-writing before itself.
      "drops the named skill regardless of read order",
      ["claude-in-codex:using-claude-cli", "claude-in-codex:adversarial-review"],
      dependencies,
      ["claude-in-codex:adversarial-review"],
    ],
    [
      "follows the chain through a dropped dependency",
      [
        "claude-in-codex:adversarial-review",
        "claude-in-codex:using-claude-cli",
        "writing:agent-instructions",
      ],
      dependencies,
      ["claude-in-codex:adversarial-review"],
    ],
    [
      // The unrelated c keeps the cycle fallback from restoring a and b on its own.
      "keeps both skills when their bodies name each other",
      ["a", "b", "c"],
      mutual,
      ["a", "b", "c"],
    ],
    ["keeps every skill when no body names another", ["a", "b"], new Map(), ["a", "b"]],
    [
      "keeps every skill when a cycle would otherwise drop them all",
      ["a", "b", "c"],
      cycle,
      ["a", "b", "c"],
    ],
  ])("%s", (_name, detected, skillDependencies, expected) => {
    expect(dropDependencyLoads(detected, skillDependencies)).toStrictEqual(expected);
  });
});

describe("buildCaseResult", () => {
  it("records the loads the dependency rule dropped", () => {
    const result = buildCaseResult(
      verdictOptions({
        observations: invokedObservations("demo:helper-skill", TARGET),
        skillDependencies: new Map([[TARGET, new Set(["demo:helper-skill"])]]),
      }),
    );

    expect(result).toMatchObject({
      invoked: true,
      invokedSkills: [TARGET],
      dependencyLoads: ["demo:helper-skill"],
      passed: true,
    });
    expect(result.wrongSkill).toBeUndefined();
    expect(
      buildCaseResult(verdictOptions({ observations: invokedObservations(TARGET) }))
        .dependencyLoads,
    ).toBeUndefined();
  });

  it("passes an invoke case when only the target fired", () => {
    // No loaded-skills observation, so the isolation check is skipped.
    const result = buildCaseResult(verdictOptions({ observations: invokedObservations(TARGET) }));

    expect(result).toStrictEqual({
      caseId: "case-1",
      expect: "invoke",
      invocationSignal: "stdout-skill-canary",
      invoked: true,
      invokedSkills: [TARGET],
      passed: true,
      durationMs: 10,
      exitCode: 0,
      finalMessagePath: "/tmp/final.txt",
      stdoutPath: "/tmp/stdout.jsonl",
      stderrPath: "/tmp/stderr.log",
    });
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

  // Spec: "Pass iff the target does not fire AND the named alternate is the only skill that
  // fires. Anything else (nothing fires, a different skill fires, both fire) fails."
  describe("routing assertion", () => {
    const ALTERNATE = "demo:sibling-skill";
    const routingCase = {
      id: "existing-feedback",
      expect: "skip" as const,
      invokeInstead: ALTERNATE,
    };

    it("passes when the alternate is the only skill that fires", () => {
      const result = buildCaseResult(
        verdictOptions({ testCase: routingCase, observations: invokedObservations(ALTERNATE) }),
      );

      expect(result).toMatchObject({
        expect: "skip",
        invokeInstead: ALTERNATE,
        invoked: false,
        wrongSkill: ALTERNATE,
        passed: true,
      });
    });

    it.each([
      ["nothing fires", observations()],
      ["a different skill fires", invokedObservations("demo:other-skill")],
      ["the target fires", invokedObservations(TARGET)],
      ["the target and the alternate both fire", invokedObservations(TARGET, ALTERNATE)],
      [
        "the alternate and another skill both fire",
        invokedObservations(ALTERNATE, "demo:other-skill"),
      ],
    ])("fails when %s", (_label, caseObservations) => {
      const result = buildCaseResult(
        verdictOptions({ testCase: routingCase, observations: caseObservations }),
      );

      expect(result.passed).toBe(false);
      expect(result.invokeInstead).toBe(ALTERNATE);
    });

    it("passes when the alternate is detected more than once and nothing else fires", () => {
      const result = buildCaseResult(
        verdictOptions({
          testCase: routingCase,
          observations: invokedObservations(ALTERNATE, ALTERNATE),
        }),
      );

      expect(result.passed).toBe(true);
      expect(result.invokedSkills).toStrictEqual([ALTERNATE]);
    });

    it("fails when the assertion names the target and the target fires", () => {
      const result = buildCaseResult(
        verdictOptions({
          testCase: { ...routingCase, invokeInstead: TARGET },
          observations: invokedObservations(TARGET),
        }),
      );

      expect(result).toMatchObject({ invoked: true, passed: false });
    });

    it("leaves invokeInstead off results of plain cases", () => {
      const result = buildCaseResult(verdictOptions());

      expect(result).not.toHaveProperty("invokeInstead");
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

  const noActivity = { hasActivity: false, decisionItemCount: 0 };
  const apiError = "API Error: 500 Internal server error.";

  it.each<[string, "invoke" | "skip", Partial<CaseObservations>, Partial<CliRunResult>, string]>([
    [
      "reports sandbox_apply refusal instead of a skip",
      "skip",
      noActivity,
      { exitCode: 1, stderr: "sandbox-exec: sandbox_apply: Operation not permitted" },
      // The no-output message would quote the same stderr line, so match past it.
      "sandbox_apply: Operation not permitted — case subprocesses could not apply their OS sandbox",
    ],
    [
      "reports a run that produced no agent output, quoting its stderr",
      "skip",
      noActivity,
      { exitCode: 1, stderr: "codex: unable to authenticate" },
      "no agent output, so the case cannot be classified as a skip. stderr: codex: unable to authenticate",
    ],
    [
      // The API-error transcript from #168: the error arrives as an assistant text event plus an
      // is_error result, so activity and decision counts look like a normal run.
      "reports a runtime error on a skip case with no invocation",
      "skip",
      { errorSignal: apiError },
      { exitCode: 1, error: "claude -p exited with code 1." },
      apiError,
    ],
    [
      "marks an invoke case as environmental, not a trigger miss, on a runtime error",
      "invoke",
      { errorSignal: apiError },
      { exitCode: 1, error: "claude -p exited with code 1." },
      apiError,
    ],
    [
      "quotes the runtime error over the no-output message when a run had no activity",
      "skip",
      { ...noActivity, errorSignal: "stream disconnected" },
      { exitCode: 1, error: "codex exec exited with code 1." },
      "error: stream disconnected",
    ],
  ])("environmental failure: %s", (_name, expectation, caseObservations, runResult, message) => {
    const result = buildCaseResult(
      verdictOptions({
        testCase: { id: "case-1", expect: expectation },
        observations: observations(caseObservations),
        runResult: buildCliRunResult(runResult),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.environmentalFailure).toContain(message);
  });

  it("keeps an observed invocation over a later runtime error", () => {
    const result = buildCaseResult(
      verdictOptions({
        observations: { ...invokedObservations(TARGET), errorSignal: "stream aborted" },
        runResult: buildCliRunResult({ exitCode: 1, error: "claude -p exited with code 1." }),
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.environmentalFailure).toBeUndefined();
  });

  it.each([
    ["stop-when", "item-budget"],
    ["timeout", "timeout"],
    ["abort", undefined],
  ] as const)(
    "ignores a runtime error the harness itself caused by ending the run (%s)",
    (endedBy, skipSignal) => {
      // Claude Code 2.1.x (recorded 2026-08) answers the harness SIGTERM with an is_error result
      // whose terminal_reason is aborted_tools or aborted_streaming, so a harness-caused ending
      // must not read as an environmental failure.
      const result = buildCaseResult(
        verdictOptions({
          testCase: { id: "skip-case", expect: "skip" },
          observations: observations({ errorSignal: "Request was aborted." }),
          runResult: buildCliRunResult({ endedBy }),
        }),
      );

      expect(result.environmentalFailure).toBeUndefined();
      expect(result.skipSignal).toBe(skipSignal);
    },
  );

  it.each(["stop-when", "abort"] as const)(
    "trusts a run ended by %s without agent activity",
    (endedBy) => {
      const result = buildCaseResult(
        verdictOptions({
          testCase: { id: "skip-case", expect: "skip" },
          observations: observations(noActivity),
          runResult: buildCliRunResult({ endedBy }),
        }),
      );

      expect(result.passed).toBe(true);
      expect(result.environmentalFailure).toBeUndefined();
    },
  );

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
});
