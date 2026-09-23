import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCaseLine, printTriggerEvalResult } from "../../src/trigger-evals/output.js";
import type { TriggerCaseResult, TriggerEvalResult } from "../../src/trigger-evals/types.js";

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
  it("prints a plain skip", () => {
    expect(formatCaseLine(caseResult({ skipSignal: "completed" }))).toBe(
      "- PASS existing-feedback: expected skip, observed skip (1.5s)",
    );
  });

  it("names the alternate on a passing routing assertion", () => {
    expect(
      formatCaseLine(
        caseResult({
          invokeInstead: "demo:sibling",
          invocationSignal: "stdout-skill-canary",
          invokedSkills: ["demo:sibling"],
          wrongSkill: "demo:sibling",
        }),
      ),
    ).toBe(
      "- PASS existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling via stdout-skill-canary (1.5s)",
    );
  });

  it("lists every other skill when a routing assertion fails with the alternate", () => {
    expect(
      formatCaseLine(
        caseResult({
          invokeInstead: "demo:sibling",
          invocationSignal: "stream-skill-tool-use",
          invokedSkills: ["demo:sibling", "other:skill"],
          wrongSkill: "demo:sibling",
          passed: false,
        }),
      ),
    ).toBe(
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
    );
  });

  it("names the alternate even when another skill was detected first", () => {
    expect(
      formatCaseLine(
        caseResult({
          invokeInstead: "demo:sibling",
          invocationSignal: "stream-skill-tool-use",
          invokedSkills: ["other:skill", "demo:sibling"],
          wrongSkill: "other:skill",
          passed: false,
        }),
      ),
    ).toBe(
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed alternate demo:sibling plus wrong-skill other:skill via stream-skill-tool-use (1.5s)",
    );
  });

  it("reports a different skill as wrong-skill on a routing assertion", () => {
    expect(
      formatCaseLine(
        caseResult({
          invokeInstead: "demo:sibling",
          invocationSignal: "stdout-skill-canary",
          invokedSkills: ["other:skill"],
          wrongSkill: "other:skill",
          passed: false,
        }),
      ),
    ).toBe(
      "- FAIL existing-feedback: expected skip with invoke-instead demo:sibling, observed wrong-skill other:skill via stdout-skill-canary (1.5s)",
    );
  });
});

describe("printTriggerEvalResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("warns about runtime directories the run could not remove without failing the run", () => {
    const log = vi.spyOn(console, "log").mockReturnValue(undefined);
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    const result: TriggerEvalResult = {
      runDir: "/tmp/run",
      reportPath: "/tmp/run/report.json",
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
      results: [caseResult({ skipSignal: "completed" })],
      cleanupFailures: ["/tmp/run/codex-home: EACCES: permission denied"],
    };

    printTriggerEvalResult(result);

    expect(warn).toHaveBeenCalledWith(
      "WARNING: runtime cleanup left /tmp/run/codex-home: EACCES: permission denied",
    );
    expect(log).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
