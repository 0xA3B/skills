import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCaseLines, printTriggerEvalResult } from "../../src/trigger-evals/output.js";
import type { TriggerEvalResult } from "../../src/trigger-evals/runner.js";
import type { TriggerCaseResult } from "../../src/trigger-evals/verdict.js";

function caseResult(overrides: Partial<TriggerCaseResult> = {}): TriggerCaseResult {
  return {
    caseId: "existing-feedback",
    attempt: 1,
    expect: "skip",
    invocationSignal: "none",
    invoked: false,
    invokedSkills: [],
    passed: true,
    durationMs: 1500,
    exitCode: 0,
    finalMessagePath: "/tmp/final.txt",
    stdoutPath: "/tmp/stdout.jsonl",
    stderrPath: "/tmp/stderr.log",
    ...overrides,
  };
}

describe("formatCaseLines", () => {
  it.each<[string, Partial<TriggerCaseResult>, string[]]>([
    [
      "prints a plain skip",
      { skipSignal: "completed" },
      [
        "- PASS existing-feedback: 1/1 passed, expected skip",
        "  attempt 1 PASS: observed skip (1.5s)",
      ],
    ],
    [
      "names the item budget that ended a skip",
      { skipSignal: "item-budget" },
      [
        "- PASS existing-feedback: 1/1 passed, expected skip",
        "  attempt 1 PASS: observed skip via item-budget (1.5s)",
      ],
    ],
    [
      "flags a timeout skip as a weak signal",
      { skipSignal: "timeout" },
      [
        "- PASS existing-feedback: 1/1 passed, expected skip",
        "  attempt 1 PASS: observed skip via timeout (weak signal) (1.5s)",
      ],
    ],
    [
      "prints an environmental failure as ERROR, not FAIL",
      { passed: false, environmentalFailure: "the run produced no agent output" },
      [
        "- ERROR existing-feedback: 0/1 passed (1 error), expected skip",
        "  attempt 1 ERROR: observed skip (1.5s)",
        "    environment: the run produced no agent output",
      ],
    ],
    [
      "prints a sub-second duration in milliseconds",
      { skipSignal: "completed", durationMs: 250 },
      [
        "- PASS existing-feedback: 1/1 passed, expected skip",
        "  attempt 1 PASS: observed skip (250ms)",
      ],
    ],
    [
      "lists the dependency loads the verdict dropped",
      {
        expect: "invoke",
        invocationSignal: "command-skill-read",
        invoked: true,
        invokedSkills: ["demo:target"],
        dependencyLoads: ["writing:technical-writing"],
      },
      [
        "- PASS existing-feedback: 1/1 passed, expected invoke",
        "  attempt 1 PASS: observed invoke via command-skill-read; dependency loads writing:technical-writing (1.5s)",
      ],
    ],
    [
      // Overlap: the wrong skill is named even though the target invocation was observed.
      "names a wrong skill that fired alongside the target",
      {
        expect: "invoke",
        invocationSignal: "stdout-skill-canary",
        invoked: true,
        invokedSkills: ["demo:target", "demo:sibling"],
        wrongSkill: "demo:sibling",
        passed: false,
      },
      [
        "- FAIL existing-feedback: 0/1 passed, expected invoke",
        "  attempt 1 FAIL: observed invoke plus wrong-skill demo:sibling via stdout-skill-canary (1.5s)",
      ],
    ],
    [
      "names the alternate on a passing routing assertion",
      {
        invokeInstead: "demo:sibling",
        invocationSignal: "stdout-skill-canary",
        invokedSkills: ["demo:sibling"],
        wrongSkill: "demo:sibling",
      },
      [
        "- PASS existing-feedback: 1/1 passed, expected skip with invoke-instead demo:sibling",
        "  attempt 1 PASS: observed alternate demo:sibling via stdout-skill-canary (1.5s)",
      ],
    ],
    [
      "lists every other skill when a routing assertion fails with the alternate",
      {
        invokeInstead: "demo:sibling",
        invocationSignal: "stream-skill-tool-use",
        invokedSkills: ["demo:sibling", "other:skill"],
        wrongSkill: "demo:sibling",
        passed: false,
      },
      [
        "- FAIL existing-feedback: 0/1 passed, expected skip with invoke-instead demo:sibling",
        "  attempt 1 FAIL: observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
      ],
    ],
    [
      "names the alternate even when another skill was detected first",
      {
        invokeInstead: "demo:sibling",
        invocationSignal: "stream-skill-tool-use",
        invokedSkills: ["other:skill", "demo:sibling"],
        wrongSkill: "other:skill",
        passed: false,
      },
      [
        "- FAIL existing-feedback: 0/1 passed, expected skip with invoke-instead demo:sibling",
        "  attempt 1 FAIL: observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
      ],
    ],
    [
      "reports a different skill as wrong-skill on a routing assertion",
      {
        invokeInstead: "demo:sibling",
        invocationSignal: "stdout-skill-canary",
        invokedSkills: ["other:skill"],
        wrongSkill: "other:skill",
        passed: false,
      },
      [
        "- FAIL existing-feedback: 0/1 passed, expected skip with invoke-instead demo:sibling",
        "  attempt 1 FAIL: observed wrong-skill other:skill via stdout-skill-canary (1.5s)",
      ],
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(formatCaseLines([caseResult(overrides)])).toStrictEqual(expected);
  });

  it("tallies the attempts and fails the case when any attempt fails", () => {
    expect(
      formatCaseLines([
        caseResult({ attempt: 1, skipSignal: "completed" }),
        caseResult({ attempt: 2, passed: false, wrongSkill: "demo:sibling" }),
        caseResult({
          attempt: 3,
          passed: false,
          environmentalFailure: "the run produced no agent output",
        }),
      ]),
    ).toStrictEqual([
      "- FAIL existing-feedback: 1/3 passed (1 error), expected skip",
      "  attempt 1 PASS: observed skip (1.5s)",
      "  attempt 2 FAIL: observed wrong-skill demo:sibling via none (1.5s)",
      "  attempt 3 ERROR: observed skip (1.5s)",
      "    environment: the run produced no agent output",
    ]);
  });

  it("marks a case ERROR when its only failures are environmental", () => {
    expect(
      formatCaseLines([
        caseResult({ attempt: 1 }),
        caseResult({ attempt: 2, passed: false, environmentalFailure: "unstaged skills loaded" }),
      ])[0],
    ).toBe("- ERROR existing-feedback: 1/2 passed (1 error), expected skip");
  });
});

describe("printTriggerEvalResult", () => {
  // The report path prints relative to the working directory.
  const reportPath = path.join(process.cwd(), "run", "report.json");

  function evalResult(overrides: Partial<TriggerEvalResult> = {}): TriggerEvalResult {
    return {
      runDir: "/tmp/run",
      reportPath,
      target: {
        kind: "plugin",
        repoRoot: "/tmp/repo",
        pluginName: "demo",
        pluginPath: "/tmp/repo/plugins/demo",
        skillName: "auto-skill",
        skillPath: "/tmp/repo/plugins/demo/skills/auto-skill",
        skillFilePath: "/tmp/repo/plugins/demo/skills/auto-skill/SKILL.md",
        metadataPath: "/tmp/repo/plugins/demo/skills/auto-skill/agents/openai.yaml",
        fixturePath: "/tmp/repo/plugins/demo/skills/auto-skill/evals/triggers.yaml",
      },
      agent: "codex",
      model: "gpt-6-sol",
      effort: "medium",
      durationMs: 10,
      results: [],
      ...overrides,
    };
  }

  function captureConsole() {
    return {
      log: vi.spyOn(console, "log").mockReturnValue(undefined),
      warn: vi.spyOn(console, "warn").mockReturnValue(undefined),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints every case with its details, then warns about runtime directories it left", () => {
    const { log, warn } = captureConsole();

    printTriggerEvalResult(
      evalResult({
        agentVersion: "codex-cli 0.159.3",
        results: [
          caseResult({ caseId: "skip-case", skipSignal: "completed" }),
          caseResult({
            caseId: "invoke-case",
            expect: "invoke",
            skipSignal: "completed",
            passed: false,
          }),
          caseResult({
            caseId: "dead-case",
            passed: false,
            environmentalFailure: "the run produced no agent output",
            error: "codex exec exited with code 1.",
          }),
        ],
        cleanupFailures: ["/tmp/run/codex-home: EACCES: permission denied"],
      }),
    );

    expect(log.mock.calls.flat()).toStrictEqual([
      "Trigger eval completed for demo:auto-skill on codex: 1/3 passed in 10ms.",
      "Agent: codex-cli 0.159.3, model gpt-6-sol, effort medium.",
      "- PASS skip-case: 1/1 passed, expected skip",
      "  attempt 1 PASS: observed skip (1.5s)",
      "- FAIL invoke-case: 0/1 passed, expected invoke",
      "  attempt 1 FAIL: observed skip (1.5s)",
      "- ERROR dead-case: 0/1 passed (1 error), expected skip",
      "  attempt 1 ERROR: observed skip (1.5s)",
      "    environment: the run produced no agent output",
      "    error: codex exec exited with code 1.",
      "Report written to run/report.json.",
    ]);
    expect(warn.mock.calls.flat()).toStrictEqual([
      "WARNING: runtime cleanup left /tmp/run/codex-home: EACCES: permission denied",
    ]);
  });

  it.each<[string, Partial<TriggerEvalResult>, string]>([
    [
      "names the model an alias resolved to",
      {
        agent: "claude",
        model: "opus",
        agentVersion: "Claude Code 2.1.286",
        resolvedModel: "claude-opus-5-5",
      },
      "Agent: Claude Code 2.1.286, model opus resolved to claude-opus-5-5, effort medium.",
    ],
    [
      "names the agent when no case reported its version",
      { agent: "claude", model: "opus" },
      "Agent: claude, model opus, effort medium.",
    ],
  ])("%s", (_name, overrides, expected) => {
    const { log } = captureConsole();

    printTriggerEvalResult(evalResult(overrides));

    expect(log.mock.calls.flat()[1]).toBe(expected);
  });

  it("warns with the skip reason instead of a summary when the run was skipped", () => {
    const { log, warn } = captureConsole();

    printTriggerEvalResult(evalResult({ skippedReason: "demo:auto-skill is manual-only." }));

    expect(log).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat()).toStrictEqual([
      "WARNING: demo:auto-skill is manual-only.",
      "Report written to run/report.json.",
    ]);
  });
});
