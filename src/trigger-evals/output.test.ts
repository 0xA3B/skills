import { describe, expect, it } from "vitest";

import { formatCaseLine } from "./output.js";
import type { TriggerCaseResult } from "./types.js";

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
