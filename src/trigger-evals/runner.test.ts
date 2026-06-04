import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CodexRunResult } from "./codex-exec.js";

const mockState = vi.hoisted(() => ({
  codexResults: [] as Array<{
    exitCode: number | null;
    finalMessage: string;
    stderr: string;
    stdoutPath: string;
    stderrPath: string;
    finalMessagePath: string;
    error?: string;
    delayMs?: number;
  }>,
  activeExecs: 0,
  maxActiveExecs: 0,
  codexHomes: [] as string[],
}));

vi.mock("./codex-exec.js", () => ({
  runCodexExec: vi.fn<(options: { codexHome: string; prompt: string }) => Promise<CodexRunResult>>(
    async (options) => {
      mockState.codexHomes.push(options.codexHome);
      mockState.activeExecs += 1;
      mockState.maxActiveExecs = Math.max(mockState.maxActiveExecs, mockState.activeExecs);

      try {
        const result = mockState.codexResults.shift() ?? buildMockCodexResult(options.prompt);
        if (result.delayMs !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, result.delayMs));
        }
        return result;
      } finally {
        mockState.activeExecs -= 1;
      }
    },
  ),
}));

vi.mock("./codex-home.js", () => ({
  prepareCodexHome: vi.fn<() => Promise<void>>(async () => undefined),
  removeCopiedAuth: vi.fn<() => Promise<void>>(async () => undefined),
}));

import { runTriggerEval } from "./runner.js";

describe("runTriggerEval", () => {
  beforeEach(() => {
    mockState.codexResults = [];
    mockState.activeExecs = 0;
    mockState.maxActiveExecs = 0;
    mockState.codexHomes = [];
  });

  it("fails cases when codex exec errors even if invocation expectation matches", async () => {
    const repoRoot = await writeRepoFixture();
    mockState.codexResults.push({
      exitCode: 1,
      finalMessage: "",
      stderr: "",
      stdoutPath: "/tmp/stdout.jsonl",
      stderrPath: "/tmp/stderr.log",
      finalMessagePath: "/tmp/final.txt",
      error: "codex exec exited with code 1.",
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "codex_plugins/demo/skills/auto-skill",
      caseId: "skip-case",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      caseId: "skip-case",
      expect: "skip",
      invoked: false,
      passed: false,
      error: "codex exec exited with code 1.",
    });
  });

  it("runs cases concurrently while preserving fixture order", async () => {
    const repoRoot = await writeRepoFixture({
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
        { id: "case-c", expect: "invoke" },
        { id: "case-d", expect: "skip" },
      ],
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "codex_plugins/demo/skills/auto-skill",
      concurrency: 2,
    });

    expect(result.results.map((caseResult) => caseResult.caseId)).toEqual([
      "case-a",
      "case-b",
      "case-c",
      "case-d",
    ]);
    expect(result.results.every((caseResult) => caseResult.passed)).toBe(true);
    expect(mockState.maxActiveExecs).toBe(2);
    expect(new Set(mockState.codexHomes).size).toBe(4);
  });
});

function buildMockCodexResult(prompt: string): CodexRunResult & { delayMs: number } {
  const shouldInvoke = !prompt.startsWith("Do not invoke");
  return {
    exitCode: 0,
    finalMessage: "",
    stderr: shouldInvoke ? "codex.skill.injected demo:auto-skill" : "",
    stdoutPath: "/tmp/stdout.jsonl",
    stderrPath: "/tmp/stderr.log",
    finalMessagePath: "/tmp/final.txt",
    delayMs: 50,
  };
}

async function writeRepoFixture(
  options: {
    cases?: Array<{ id: string; expect: "invoke" | "skip" }>;
  } = {},
): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const pluginPath = path.join(repoRoot, "codex_plugins", "demo");
  const skillPath = path.join(pluginPath, "skills", "auto-skill");

  await mkdir(path.join(pluginPath, ".codex-plugin"), { recursive: true });
  await mkdir(path.join(skillPath, "agents"), { recursive: true });
  await mkdir(path.join(skillPath, "evals"), { recursive: true });
  await writeFile(
    path.join(pluginPath, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "demo", version: "1.0.0", skills: "./skills/" }),
  );
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: auto-skill\n---\n");
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
  );
  await writeFile(
    path.join(skillPath, "evals", "triggers.yaml"),
    [
      "version: 1",
      "cases:",
      ...fixtureCaseLines(
        options.cases ?? [
          { id: "invoke-case", expect: "invoke" },
          { id: "skip-case", expect: "skip" },
        ],
      ),
      "",
    ].join("\n"),
  );

  return repoRoot;
}

function fixtureCaseLines(cases: Array<{ id: string; expect: "invoke" | "skip" }>): string[] {
  return cases.flatMap((testCase) => [
    `  - id: ${testCase.id}`,
    `    prompt: ${testCase.expect === "invoke" ? "Invoke" : "Do not invoke"} the skill.`,
    `    expect: ${testCase.expect}`,
  ]);
}
