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
  }>,
}));

vi.mock("./codex-exec.js", () => ({
  runCodexExec: vi.fn<() => Promise<CodexRunResult>>(async () => {
    const result = mockState.codexResults.shift();
    if (result === undefined) {
      throw new Error("Missing mocked Codex result.");
    }

    return result;
  }),
}));

vi.mock("./codex-home.js", () => ({
  prepareCodexHome: vi.fn<() => Promise<void>>(async () => undefined),
  removeCopiedAuth: vi.fn<() => Promise<void>>(async () => undefined),
}));

import { runTriggerEval } from "./runner.js";

describe("runTriggerEval", () => {
  beforeEach(() => {
    mockState.codexResults = [];
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
});

async function writeRepoFixture(): Promise<string> {
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
      "  - id: invoke-case",
      "    prompt: Invoke the skill.",
      "    expect: invoke",
      "  - id: skip-case",
      "    prompt: Do not invoke the skill.",
      "    expect: skip",
      "",
    ].join("\n"),
  );

  return repoRoot;
}
