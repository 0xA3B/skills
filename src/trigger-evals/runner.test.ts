import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import type { CliRunResult } from "./exec.js";

const mockState = vi.hoisted(() => ({
  codexResults: [] as Array<{
    exitCode: number | null;
    finalMessage: string;
    stdout: string;
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
  workspacePaths: [] as string[],
  sandboxModes: [] as string[],
  stopWhenPredicates: [] as Array<(output: { stdout: string; stderr: string }) => boolean>,
  claudePluginDirs: [] as string[],
  claudeWorkspacePaths: [] as string[],
  claudeModels: [] as string[],
  claudeEfforts: [] as string[],
  codexHomeModels: [] as string[],
  codexHomeEfforts: [] as string[],
}));

vi.mock(import("./codex-exec.js"), () => ({
  runCodexExec: vi.fn<
    (options: {
      codexHome: string;
      prompt: string;
      workspacePath: string;
      sandboxMode: "read-only" | "workspace-write";
      stopWhen?: (output: { stdout: string; stderr: string }) => boolean;
    }) => Promise<CliRunResult>
  >(async (options) => {
    mockState.codexHomes.push(options.codexHome);
    mockState.workspacePaths.push(options.workspacePath);
    mockState.sandboxModes.push(options.sandboxMode);
    if (options.stopWhen !== undefined) {
      mockState.stopWhenPredicates.push(options.stopWhen);
    }
    mockState.activeExecs += 1;
    mockState.maxActiveExecs = Math.max(mockState.maxActiveExecs, mockState.activeExecs);

    try {
      const result = mockState.codexResults.shift() ?? (await buildMockCodexResult(options));
      if (result.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, result.delayMs));
      }
      return result;
    } finally {
      mockState.activeExecs -= 1;
    }
  }),
}));

vi.mock(import("./codex-home.js"), () => ({
  prepareCodexHome: vi.fn<(options: { model: string; effort: string }) => Promise<void>>(
    async (options) => {
      mockState.codexHomeModels.push(options.model);
      mockState.codexHomeEfforts.push(options.effort);
    },
  ),
  removeCopiedAuth: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock(import("./claude-exec.js"), () => ({
  runClaudeExec: vi.fn<
    (options: {
      pluginDir?: string;
      prompt: string;
      workspacePath: string;
      model: string;
      effort: string;
    }) => Promise<{
      exitCode: number | null;
      finalMessage: string;
      stdout: string;
      stderr: string;
      stdoutPath: string;
      stderrPath: string;
      finalMessagePath: string;
    }>
  >(async (options) => {
    mockState.claudePluginDirs.push(options.pluginDir ?? "(none)");
    mockState.claudeWorkspacePaths.push(options.workspacePath);
    mockState.claudeModels.push(options.model);
    mockState.claudeEfforts.push(options.effort);
    const shouldInvoke = !options.prompt.startsWith("Do not invoke");
    return {
      exitCode: 0,
      finalMessage: "",
      stdout: shouldInvoke
        ? JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "Skill", input: { command: "demo:auto-skill" } }],
            },
          })
        : "",
      stderr: "",
      stdoutPath: "/tmp/events.jsonl",
      stderrPath: "/tmp/stderr.log",
      finalMessagePath: "/tmp/final.txt",
    };
  }),
}));

import { runTriggerEval, streamContainsSkillToolUse } from "./runner.js";

describe("runTriggerEval", () => {
  beforeEach(() => {
    mockState.codexResults = [];
    mockState.activeExecs = 0;
    mockState.maxActiveExecs = 0;
    mockState.codexHomes = [];
    mockState.workspacePaths = [];
    mockState.sandboxModes = [];
    mockState.stopWhenPredicates = [];
    mockState.claudePluginDirs = [];
    mockState.claudeWorkspacePaths = [];
    mockState.claudeModels = [];
    mockState.claudeEfforts = [];
    mockState.codexHomeModels = [];
    mockState.codexHomeEfforts = [];
  });

  it("passes cases when invocation expectation matches even if codex exec errors", async () => {
    const repoRoot = await writeRepoFixture();
    mockState.codexResults.push({
      exitCode: 1,
      finalMessage: "",
      stdout: "",
      stderr: "",
      stdoutPath: "/tmp/stdout.jsonl",
      stderrPath: "/tmp/stderr.log",
      finalMessagePath: "/tmp/final.txt",
      error: "codex exec exited with code 1.",
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseId: "skip-case",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      caseId: "skip-case",
      expect: "skip",
      invoked: false,
      passed: true,
      error: "codex exec exited with code 1.",
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(result.results[0]?.durationMs ?? 0);
    expect(result.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
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
      skillPath: "plugins/demo/skills/auto-skill",
      concurrency: 2,
    });

    expect(result.results.map((caseResult) => caseResult.caseId)).toStrictEqual([
      "case-a",
      "case-b",
      "case-c",
      "case-d",
    ]);
    expect(result.results.every((caseResult) => caseResult.passed)).toBe(true);
    expect(result.results.every((caseResult) => caseResult.durationMs >= 0)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(
      Math.max(...result.results.map((caseResult) => caseResult.durationMs)),
    );
    expect(mockState.maxActiveExecs).toBe(2);
    expect(new Set(mockState.codexHomes).size).toBe(4);
    expect(new Set(mockState.sandboxModes)).toStrictEqual(new Set(["read-only"]));
    expect(new Set(mockState.codexHomeModels)).toStrictEqual(new Set(["gpt-5.6-sol"]));
    expect(new Set(mockState.codexHomeEfforts)).toStrictEqual(new Set(["medium"]));
    expect(
      mockState.stopWhenPredicates[0]?.({
        stdout: "",
        stderr: "codex.skill.injected demo:auto-skill",
      }),
    ).toBe(true);
    const sharedWorkspace = mockState.workspacePaths[0];
    const stagedSkill = await readFile(
      path.join(sharedWorkspace ?? "", "plugins", "demo", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    expect(stagedSkill).toContain("Trigger Eval Instructions");
    expect(stagedSkill).not.toContain("Eval only:");
    const canary = stagedSkill.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
    expect(canary).toBeDefined();
    expect(
      mockState.stopWhenPredicates[0]?.({
        stdout: JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: canary },
        }),
        stderr: "",
      }),
    ).toBe(true);
  });

  it("applies fixture workspace files in a case-isolated workspace", async () => {
    const repoRoot = await writeRepoFixture({
      cases: [
        {
          id: "agents-case",
          expect: "skip",
          workspaceFiles: {
            "AGENTS.md": "Commit messages must use Gitmoji, not Conventional Commits.\n",
          },
        },
        { id: "plain-case", expect: "invoke" },
      ],
    });

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      concurrency: 2,
    });

    const agentsWorkspace = mockState.workspacePaths.find((workspacePath) =>
      workspacePath.includes(path.join("cases", "agents-case", "workspace")),
    );
    const plainWorkspace = mockState.workspacePaths.find(
      (workspacePath) => !workspacePath.includes(path.join("cases")),
    );
    expect(agentsWorkspace).toBeDefined();
    expect(plainWorkspace).toBeDefined();
    expect(agentsWorkspace).toContain(path.join("cases", "agents-case", "workspace"));
    await expect(readFile(path.join(agentsWorkspace ?? "", "AGENTS.md"), "utf8")).resolves.toBe(
      "Commit messages must use Gitmoji, not Conventional Commits.\n",
    );
    expect(plainWorkspace).toContain(os.tmpdir());
    expect(plainWorkspace).not.toContain(path.join("cases", "plain-case", "workspace"));
  });

  it("evaluates plugin skills on Claude via the Skill tool stream signal", async () => {
    const repoRoot = await writeRepoFixture();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      agent: "claude",
    });

    expect(result.agent).toBe("claude");
    expect(result.runDir).toContain("-claude-");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      caseId: "invoke-case",
      expect: "invoke",
      invocationSignal: "stream-skill-tool-use",
      invoked: true,
      passed: true,
    });
    expect(result.results[1]).toMatchObject({
      caseId: "skip-case",
      expect: "skip",
      invoked: false,
      passed: true,
    });
    expect(mockState.codexHomes).toStrictEqual([]);
    expect(new Set(mockState.claudeModels)).toStrictEqual(new Set(["opus"]));
    expect(new Set(mockState.claudeEfforts)).toStrictEqual(new Set(["medium"]));
    expect(mockState.claudePluginDirs).toHaveLength(2);
    expect(mockState.claudePluginDirs[0]).toContain(path.join("plugins", "demo"));
    expect(mockState.claudePluginDirs[0]).toContain(
      mockState.claudeWorkspacePaths[0] ?? "missing-workspace",
    );
  });

  it("evaluates repo-local skill targets on Claude as pristine project skills", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: ".agents/skills/auto-skill",
      agent: "claude",
    });

    expect(result.agent).toBe("claude");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      caseId: "repo-local-case",
      expect: "invoke",
      invocationSignal: "stream-skill-tool-use",
      invoked: true,
      passed: true,
    });
    expect(result.results[1]).toMatchObject({
      caseId: "skip-case",
      expect: "skip",
      invoked: false,
      passed: true,
    });
    expect(mockState.claudePluginDirs).toStrictEqual(["(none)", "(none)"]);
    const stagedProjectSkill = await readFile(
      path.join(
        mockState.claudeWorkspacePaths[0] ?? "",
        ".claude",
        "skills",
        "auto-skill",
        "SKILL.md",
      ),
      "utf8",
    );
    expect(stagedProjectSkill).not.toContain("Eval only:");
    expect(stagedProjectSkill).not.toContain("Trigger Eval Instructions");
  });

  it("evaluates repo-local skill targets with an injected canary", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: ".agents/skills/auto-skill",
      caseId: "repo-local-case",
    });

    expect(result.target).toMatchObject({ kind: "repo-local", skillName: "auto-skill" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      caseId: "repo-local-case",
      expect: "invoke",
      invocationSignal: "stdout-skill-canary",
      invoked: true,
      passed: true,
    });
    expect(result.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockState.sandboxModes).toStrictEqual(["workspace-write"]);
    const repoLocalWorkspace = mockState.workspacePaths[0];
    const skillBody = await readFile(
      path.join(repoLocalWorkspace ?? "", ".agents", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
    expect(canary).toBeDefined();
    const description = frontmatterDescription(skillBody);
    expect(description).toContain(`Eval only: if used, first output ${canary}.`);
    expect(description).toContain("Use when the user asks to invoke this repo-local skill.");
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(
      mockState.stopWhenPredicates[0]?.({
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: canary },
          }),
        ].join("\n"),
        stderr: "",
      }),
    ).toBe(true);
  });
});

describe("streamContainsSkillToolUse", () => {
  it("matches Skill tool_use blocks that reference the skill label", () => {
    const stdout = [
      "non-json noise",
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Loading the skill." },
            { type: "tool_use", name: "Skill", input: { command: "demo:auto-skill" } },
          ],
        },
      }),
    ].join("\n");

    expect(streamContainsSkillToolUse(stdout, "demo:auto-skill")).toBe(true);
    expect(streamContainsSkillToolUse(stdout, "demo:other-skill")).toBe(false);
  });

  it("ignores other tool_use blocks and assistant text mentioning the label", () => {
    const stdout = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I could use demo:auto-skill here." },
            { type: "tool_use", name: "Read", input: { file_path: "demo:auto-skill" } },
          ],
        },
      }),
    ].join("\n");

    expect(streamContainsSkillToolUse(stdout, "demo:auto-skill")).toBe(false);
  });
});

async function buildMockCodexResult(options: {
  prompt: string;
  workspacePath: string;
}): Promise<CliRunResult & { delayMs: number }> {
  const repoLocalSkillPath = path.join(
    options.workspacePath,
    ".agents",
    "skills",
    "auto-skill",
    "SKILL.md",
  );
  try {
    const skillBody = await readFile(repoLocalSkillPath, "utf8");
    const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
    if (canary !== undefined) {
      return {
        exitCode: 0,
        finalMessage: "",
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: canary },
          }),
        ].join("\n"),
        stderr: "",
        stdoutPath: "/tmp/stdout.jsonl",
        stderrPath: "/tmp/stderr.log",
        finalMessagePath: "/tmp/final.txt",
        delayMs: 50,
      };
    }
  } catch {
    // Plugin fixture workspaces do not include repo-local skills.
  }

  const prompt = options.prompt;
  const shouldInvoke = !prompt.startsWith("Do not invoke");
  return {
    exitCode: 0,
    finalMessage: "",
    stdout: "",
    stderr: shouldInvoke ? "codex.skill.injected demo:auto-skill" : "",
    stdoutPath: "/tmp/stdout.jsonl",
    stderrPath: "/tmp/stderr.log",
    finalMessagePath: "/tmp/final.txt",
    delayMs: 50,
  };
}

function frontmatterDescription(content: string): string {
  const match = content.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---/);
  expect(match?.groups?.["frontmatter"]).toBeDefined();
  const metadata = parseYaml(match?.groups?.["frontmatter"] ?? "") as { description?: unknown };
  expect(metadata.description).toBeTypeOf("string");
  return metadata.description as string;
}

async function writeRepoFixture(
  options: {
    cases?: Array<{
      id: string;
      expect: "invoke" | "skip";
      workspaceFiles?: Record<string, string>;
    }>;
  } = {},
): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const pluginPath = path.join(repoRoot, "plugins", "demo");
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

async function writeRepoLocalSkillFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const skillPath = path.join(repoRoot, ".agents", "skills", "auto-skill");

  await mkdir(path.join(skillPath, "agents"), { recursive: true });
  await mkdir(path.join(skillPath, "evals"), { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    [
      "---",
      "name: auto-skill",
      "description: Use when the user asks to invoke this repo-local skill.",
      "---",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
  );
  await writeFile(
    path.join(skillPath, "evals", "triggers.yaml"),
    [
      "version: 1",
      "cases:",
      "  - id: repo-local-case",
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

function fixtureCaseLines(
  cases: Array<{ id: string; expect: "invoke" | "skip"; workspaceFiles?: Record<string, string> }>,
): string[] {
  return cases.flatMap((testCase) => {
    const lines = [
      `  - id: ${testCase.id}`,
      `    prompt: ${testCase.expect === "invoke" ? "Invoke" : "Do not invoke"} the skill.`,
      `    expect: ${testCase.expect}`,
    ];
    if (testCase.workspaceFiles !== undefined) {
      lines.push("    workspace_files:");
      for (const [filePath, content] of Object.entries(testCase.workspaceFiles)) {
        lines.push(`      ${filePath}: |`);
        lines.push(...content.split("\n").map((line) => `        ${line}`));
      }
    }
    return lines;
  });
}
