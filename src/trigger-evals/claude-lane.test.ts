import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClaudeLane, observeClaudeOutput } from "./claude-lane.js";
import type { StreamingCliOptions, StreamingCliResult } from "./exec.js";
import type { LaneRunOptions } from "./lanes.js";
import { resolveSkillTarget } from "./target.js";
import { skillToolUseEvent, writeRepoFixture, writeRepoLocalSkillFixture } from "./test-utils.js";

const spawnCalls = vi.hoisted(
  () => [] as Array<{ command: string; args: string[]; options: StreamingCliOptions }>,
);

// The lane is tested against the real filesystem; only the process boundary is faked.
vi.mock(import("./exec.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnStreamingCli: vi.fn<
      (command: string, args: string[], options: StreamingCliOptions) => Promise<StreamingCliResult>
    >(async (command, args, options) => {
      spawnCalls.push({ command, args, options });
      return {
        exitCode: 0,
        stdout: skillToolUseEvent("demo:auto-skill"),
        stderr: "",
        endedBy: "completed",
      };
    }),
  };
});

async function makeRunOptions(
  repoRoot: string,
  skillPath: string,
  overrides: Partial<LaneRunOptions> = {},
): Promise<LaneRunOptions> {
  return {
    runDir: await mkdtemp(path.join(os.tmpdir(), "claude-lane-run-")),
    target: resolveSkillTarget(repoRoot, skillPath),
    model: "opus",
    effort: "medium",
    ...overrides,
  };
}

describe("createClaudeLane", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  it("stages only Claude surfaces for plugin targets", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const laneCase = await laneRun.prepareCase({
      id: "invoke-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["demo:auto-skill"]));
    const settings = JSON.parse(
      await readFile(path.join(laneCase.workspacePath, ".claude", "settings.json"), "utf8"),
    ) as unknown;
    expect(settings).toStrictEqual({ disableBundledSkills: true });
    await expect(
      readFile(path.join(laneCase.workspacePath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("builds claude args with model, effort, and case-workspace plugin dirs", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const lane = createClaudeLane({ configDir: "/tmp/claude-config" });
    const target = resolveSkillTarget(repoRoot, "plugins/demo/skills/auto-skill");
    if (target.kind !== "plugin") {
      throw new Error("expected a plugin target");
    }

    const laneRun = await lane.prepareRun(
      await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill", {
        extraPlugins: [
          { pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") },
        ],
      }),
    );
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "claude-lane-case-"));
    const laneCase = await laneRun.prepareCase({
      id: "invoke-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });
    const runResult = await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    const call = spawnCalls[0];
    expect(call?.command).toBe("claude");
    expect(call?.args).toContain("--model");
    expect(call?.args).toContain("opus");
    expect(call?.args).toContain("--effort");
    expect(call?.args?.at(-1)).toBe("Invoke the skill.");
    const pluginDirs = call?.args?.flatMap((arg, index) =>
      call.args[index - 1] === "--plugin-dir" ? [arg] : [],
    );
    expect(pluginDirs).toStrictEqual([
      path.join(laneCase.workspacePath, "plugins", "demo"),
      path.join(laneCase.workspacePath, "plugins", "other"),
    ]);
    expect(call?.options.cwd).toBe(laneCase.workspacePath);
    expect(call?.options.env["CLAUDE_CONFIG_DIR"]).toBe("/tmp/claude-config");
    expect(runResult.stdoutPath).toBe(path.join(caseDir, "events.jsonl"));
    await expect(readFile(runResult.stdoutPath, "utf8")).resolves.toContain("demo:auto-skill");
  });

  it("stages repo-local targets as pristine project skills without Codex surfaces", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeRunOptions(repoRoot, ".agents/skills/auto-skill"),
    );
    const laneCase = await laneRun.prepareCase({
      id: "repo-local-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["auto-skill"]));
    const stagedProjectSkill = await readFile(
      path.join(laneCase.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    // The Claude lane tests the committed description; invocation is detected from Skill tool
    // events, so no canary rewrite is applied.
    expect(stagedProjectSkill).not.toContain("Eval only:");
    expect(stagedProjectSkill).not.toContain("Trigger Eval Instructions");
    await expect(
      readFile(
        path.join(laneCase.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it("isolates plugin cases with workspace files while plain cases share the base workspace", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const plainCase = await laneRun.prepareCase({
      id: "plain-case",
      prompt: "Do not invoke the skill.",
      expect: "skip",
    });
    const secondPlainCase = await laneRun.prepareCase({
      id: "other-plain-case",
      prompt: "Do not invoke the skill.",
      expect: "skip",
    });
    const workspaceFilesCase = await laneRun.prepareCase({
      id: "agents-case",
      prompt: "Do not invoke the skill.",
      expect: "skip",
      workspaceFiles: { "AGENTS.md": "Use Gitmoji.\n" },
    });

    // Plain plugin cases share the base workspace; a case that mutates workspace files gets an
    // isolated copy so concurrent cases cannot clobber each other.
    expect(plainCase.workspacePath).toBe(secondPlainCase.workspacePath);
    expect(plainCase.workspacePath).not.toContain(`cases${path.sep}`);
    expect(workspaceFilesCase.workspacePath).toContain(
      path.join("cases", "agents-case", "workspace"),
    );
    await expect(
      readFile(path.join(workspaceFilesCase.workspacePath, "AGENTS.md"), "utf8"),
    ).resolves.toBe("Use Gitmoji.\n");
    await expect(readFile(path.join(plainCase.workspacePath, "AGENTS.md"), "utf8")).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("evaluates Claude-only plugins without Codex metadata", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill"),
    );

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["demo:auto-skill"]));
  });
});

describe("observeClaudeOutput", () => {
  it("collects Skill tool_use targets from the command key", () => {
    const stdout = [
      "non-json noise",
      JSON.stringify({ type: "system", subtype: "init" }),
      skillToolUseEvent("demo:auto-skill").trim(),
    ].join("\n");

    const observations = observeClaudeOutput(stdout);

    expect(observations.signal).toBe("stream-skill-tool-use");
    expect(observations.invokedSkills).toStrictEqual(["demo:auto-skill"]);
    expect(observations.hasActivity).toBe(true);
  });

  it("accepts the skill key as a fallback shape", () => {
    const stdout = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Skill", input: { skill: "demo:auto-skill" } }],
      },
    });

    expect(observeClaudeOutput(stdout).invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  it("ignores other tool_use blocks and assistant text mentioning a label", () => {
    const stdout = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "I could use demo:auto-skill here." },
          { type: "tool_use", name: "Read", input: { file_path: "demo:auto-skill" } },
        ],
      },
    });

    const observations = observeClaudeOutput(stdout);

    expect(observations.signal).toBe("none");
    expect(observations.invokedSkills).toStrictEqual([]);
    expect(observations.decisionItemCount).toBe(1);
  });

  it("reads loaded skills from the first init event only", () => {
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init", skills: ["demo:auto-skill", "doctor"] }),
      JSON.stringify({ type: "system", subtype: "init", skills: ["code-review"] }),
      JSON.stringify({ type: "result", result: "done" }),
    ].join("\n");

    const observations = observeClaudeOutput(stdout);

    expect(observations.loadedSkills).toStrictEqual(["demo:auto-skill", "doctor"]);
    expect(observations.hasActivity).toBe(true);
    expect(observations.decisionItemCount).toBe(0);
  });

  it("reports no loaded skills or activity for an empty run", () => {
    const observations = observeClaudeOutput("");

    expect(observations.loadedSkills).toBeUndefined();
    expect(observations.hasActivity).toBe(false);
    expect(observations.decisionItemCount).toBe(0);
  });

  it("counts assistant messages as decision items", () => {
    const assistantText = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "step" }] },
    });
    const stdout = [assistantText, assistantText, assistantText].join("\n");

    expect(observeClaudeOutput(stdout).decisionItemCount).toBe(3);
  });
});
