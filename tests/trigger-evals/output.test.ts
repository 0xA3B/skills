import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCaseLine, printTriggerEvalResult } from "../../src/trigger-evals/output.js";
import type { TriggerEvalResult } from "../../src/trigger-evals/runner.js";
import type { TriggerCaseResult } from "../../src/trigger-evals/verdict.js";

function caseResult(overrides: Partial<TriggerCaseResult> = {}): TriggerCaseResult {
  return {
    caseId: "existing-feedback",
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

describe("formatCaseLine", () => {
  it.each<[string, Partial<TriggerCaseResult>, string]>([
    [
      "prints a plain skip",
      { skipSignal: "completed" },
      "- PASS existing-feedback: expected skip, observed skip (1.5s)",
    ],
    [
      "names the item budget that ended a skip",
      { skipSignal: "item-budget" },
      "- PASS existing-feedback: expected skip, observed skip via item-budget (1.5s)",
    ],
    [
      "flags a timeout skip as a weak signal",
      { skipSignal: "timeout" },
      "- PASS existing-feedback: expected skip, observed skip via timeout (weak signal) (1.5s)",
    ],
    [
      "prints an environmental failure as ERROR, not FAIL",
      { passed: false, environmentalFailure: "the run produced no agent output" },
      "- ERROR existing-feedback: expected skip, observed skip (1.5s)",
    ],
    [
      "prints a sub-second duration in milliseconds",
      { skipSignal: "completed", durationMs: 250 },
      "- PASS existing-feedback: expected skip, observed skip (250ms)",
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
      "- PASS existing-feedback: expected invoke, observed invoke via command-skill-read; dependency loads writing:technical-writing (1.5s)",
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
      "- FAIL existing-feedback: expected invoke, observed invoke plus wrong-skill demo:sibling via stdout-skill-canary (1.5s)",
    ],
    [
      "names the alternate on a passing routing assertion",
      {
        invokeInstead: "demo:sibling",
        invocationSignal: "stdout-skill-canary",
        invokedSkills: ["demo:sibling"],
        wrongSkill: "demo:sibling",
      },
      "- PASS existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling via stdout-skill-canary (1.5s)",
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
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
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
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
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
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed wrong-skill other:skill via stdout-skill-canary (1.5s)",
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(formatCaseLine(caseResult(overrides))).toBe(expected);
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
      "- PASS skip-case: expected skip, observed skip (1.5s)",
      "- FAIL invoke-case: expected invoke, observed skip (1.5s)",
      "- ERROR dead-case: expected skip, observed skip (1.5s)",
      "  environment: the run produced no agent output",
      "  error: codex exec exited with code 1.",
      "Report written to run/report.json.",
    ]);
    expect(warn.mock.calls.flat()).toStrictEqual([
      "WARNING: runtime cleanup left /tmp/run/codex-home: EACCES: permission denied",
    ]);
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
