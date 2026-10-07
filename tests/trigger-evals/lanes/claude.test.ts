import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClaudeLane, observeClaudeOutput } from "../../../src/trigger-evals/lanes/claude.js";
import type {
  StreamingCliOptions,
  StreamingCliResult,
} from "../../../src/trigger-evals/lanes/exec.js";
import {
  makeLaneRunOptions,
  skillToolUseEvent,
  triggerCase,
  triggerFixtureYaml,
  writeRepoFixture,
  writeRepoLocalSkillFixture,
  writeSeedFixture,
} from "../test-utils.js";

const spawnCalls = vi.hoisted(
  () => [] as Array<{ command: string; args: string[]; options: StreamingCliOptions }>,
);

// The lane is tested against the real filesystem; only the process boundary is faked.
vi.mock(import("../../../src/trigger-evals/lanes/exec.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnStreamingCli: vi.fn<
      (command: string, args: string[], options: StreamingCliOptions) => Promise<StreamingCliResult>
    >(async (command, args, options) => {
      spawnCalls.push({ command, args, options });
      return {
        exitCode: 0,
        stdout: [
          skillToolUseEvent("demo:auto-skill").trim(),
          JSON.stringify({ type: "result", subtype: "success", result: "Loaded the skill." }),
        ].join("\n"),
        stderr: "",
        endedBy: "completed",
      };
    }),
  };
});

// Every value passed after a flag, in argument order.
function flagValues(args: string[] | undefined, flag: string): string[] {
  return (args ?? []).flatMap((arg, index) => (args?.[index - 1] === flag ? [arg] : []));
}

function assistantEvent(content: Array<Record<string, unknown>>, messageId?: string): string {
  return JSON.stringify({
    type: "assistant",
    message: { ...(messageId === undefined ? {} : { id: messageId }), content },
  });
}

function skillCall(skillLabel: string): Record<string, unknown> {
  return { type: "tool_use", name: "Skill", input: { command: skillLabel } };
}

describe("createClaudeLane", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  it("tracks the staged workspace root for release", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createClaudeLane();
    const runOptions = await makeLaneRunOptions(
      "claude",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(
      triggerCase("invoke-case", "invoke", { workspaceFiles: { "notes.md": "hello" } }),
      1,
    );
    await expect(stat(laneCase.workspacePath)).resolves.toBeDefined();

    // Releasing the tracked root takes the case workspace beneath it along.
    await expect(runOptions.runtime.release()).resolves.toStrictEqual([]);
    await expect(stat(laneCase.workspacePath)).rejects.toThrow(/ENOENT/);
  });

  it("stages only Claude surfaces for plugin targets", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["demo:auto-skill"]));
    const settings = JSON.parse(
      await readFile(path.join(laneCase.workspacePath, ".claude", "settings.json"), "utf8"),
    ) as unknown;
    expect(settings).toStrictEqual({ disableBundledSkills: true });
    await expect(
      readFile(path.join(laneCase.workspacePath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("passes the staged skills' dependencies to the run", async () => {
    const repoRoot = await writeRepoFixture({ siblingSkills: [{ name: "helper-skill" }] });
    const runOptions = await makeLaneRunOptions(
      "claude",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );
    await writeFile(
      runOptions.target.fixturePath,
      `applies:\n  - demo:helper-skill\n${triggerFixtureYaml()}`,
    );

    const laneRun = await createClaudeLane().prepareRun(runOptions);

    expect(laneRun.skillDependencies.get("demo:auto-skill")).toStrictEqual(
      new Set(["demo:helper-skill"]),
    );
  });

  it("builds claude args with model, effort, and deployment plugin dirs", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const lane = createClaudeLane({ configDir: "/tmp/claude-config" });

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, "plugins/demo/skills/auto-skill", {
        extraPlugins: [
          { pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") },
        ],
      }),
    );
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "claude-lane-case-"));
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    const runResult = await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    const call = spawnCalls[0];
    expect(call?.command).toBe("claude");
    expect(flagValues(call?.args, "--model")).toStrictEqual(["opus"]);
    expect(flagValues(call?.args, "--effort")).toStrictEqual(["medium"]);
    // Only the workspace's project settings load, and the model gets the read-only tool surface.
    expect(flagValues(call?.args, "--setting-sources")).toStrictEqual(["project"]);
    expect(flagValues(call?.args, "--tools")).toStrictEqual(["Skill,Read,Glob,Grep"]);
    expect(call?.args?.at(-1)).toBe("Invoke the skill.");
    const pluginDirs = flagValues(call?.args, "--plugin-dir");
    expect(pluginDirs.map((pluginDir) => path.basename(pluginDir))).toStrictEqual([
      "demo",
      "other",
    ]);
    for (const pluginDir of pluginDirs) {
      expect(pluginDir.startsWith(`${laneCase.workspacePath}${path.sep}`)).toBe(false);
    }
    await expect(stat(path.join(laneCase.workspacePath, "plugins"))).rejects.toThrow(/ENOENT/);
    expect(call?.options.cwd).toBe(laneCase.workspacePath);
    expect(call?.options.env["CLAUDE_CONFIG_DIR"]).toBe("/tmp/claude-config");
    expect(runResult.stdoutPath).toBe(path.join(caseDir, "events.jsonl"));
    await expect(readFile(runResult.stdoutPath, "utf8")).resolves.toContain("demo:auto-skill");
    // The final message is the result event's text.
    expect(runResult.finalMessage).toBe("Loaded the skill.");
    await expect(readFile(runResult.finalMessagePath, "utf8")).resolves.toBe("Loaded the skill.");
  });

  it("stages repo-local targets as pristine project skills without Codex surfaces", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const lane = createClaudeLane();

    const runOptions = await makeLaneRunOptions("claude", repoRoot, ".agents/skills/auto-skill");
    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("repo-local-case", "invoke"), 1);

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["auto-skill"]));
    const stagedProjectSkill = await readFile(
      path.join(laneCase.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    expect(stagedProjectSkill).toBe(await readFile(runOptions.target.skillFilePath, "utf8"));
    await expect(
      readFile(
        path.join(laneCase.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it("stages plugins plus repo-local siblings for repo-local targets", async () => {
    const repoRoot = await writeRepoLocalSkillFixture({
      marketplace: true,
      siblingSkills: [{ name: "sibling-skill" }],
    });
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, ".agents/skills/auto-skill", {
        extraPlugins: [
          { pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") },
        ],
        extraRepoLocalSkills: [
          {
            skillName: "sibling-skill",
            skillPath: path.join(repoRoot, ".agents", "skills", "sibling-skill"),
          },
        ],
      }),
    );
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "claude-lane-case-"));
    const laneCase = await laneRun.prepareCase(triggerCase("repo-local-case", "invoke"), 1);
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    expect(laneRun.stagedSkillLabels).toStrictEqual(
      new Set(["other:other-skill", "auto-skill", "sibling-skill"]),
    );
    // Plain repo-local cases share the base workspace like plain plugin cases do; a per-case copy
    // is reserved for workspace_files mutations.
    const secondPlainCase = await laneRun.prepareCase(
      triggerCase("other-repo-local-case", "skip"),
      1,
    );
    expect(secondPlainCase.workspacePath).toBe(laneCase.workspacePath);
    expect(laneCase.workspacePath).not.toContain(`cases${path.sep}`);
    // Both repo-local skills stage as project skills; the staged plugin competes through
    // --plugin-dir.
    for (const skillName of ["auto-skill", "sibling-skill"]) {
      await expect(
        readFile(
          path.join(laneCase.workspacePath, ".claude", "skills", skillName, "SKILL.md"),
          "utf8",
        ),
      ).resolves.toBeDefined();
    }
    const pluginDirs = flagValues(spawnCalls[0]?.args, "--plugin-dir");
    expect(pluginDirs.map((pluginDir) => path.basename(pluginDir))).toStrictEqual(["other"]);
    const stagedPluginDir = pluginDirs[0];
    if (stagedPluginDir === undefined) {
      throw new Error("expected a staged plugin directory");
    }
    expect(stagedPluginDir.startsWith(`${laneCase.workspacePath}${path.sep}`)).toBe(false);
  });

  it("isolates plugin cases with workspace files while plain cases share the base workspace", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const plainCase = await laneRun.prepareCase(triggerCase("plain-case", "skip"), 1);
    const secondPlainCase = await laneRun.prepareCase(triggerCase("other-plain-case", "skip"), 1);
    const agentsCase = triggerCase("agents-case", "skip", {
      workspaceFiles: { "AGENTS.md": "Use Gitmoji.\n" },
    });
    const workspaceFilesCase = await laneRun.prepareCase(agentsCase, 1);
    const secondAttempt = await laneRun.prepareCase(agentsCase, 2);

    // Plain plugin cases share the base workspace; a case that mutates workspace files gets an
    // isolated copy per attempt so concurrent attempts cannot clobber each other.
    expect(plainCase.workspacePath).toBe(secondPlainCase.workspacePath);
    expect(plainCase.workspacePath).not.toContain(`cases${path.sep}`);
    expect(workspaceFilesCase.workspacePath).toContain(
      path.join("cases", "agents-case", "attempt-1", "workspace"),
    );
    expect(secondAttempt.workspacePath).toContain(
      path.join("cases", "agents-case", "attempt-2", "workspace"),
    );
    await expect(
      readFile(path.join(workspaceFilesCase.workspacePath, "AGENTS.md"), "utf8"),
    ).resolves.toBe("Use Gitmoji.\n");
    await expect(readFile(path.join(plainCase.workspacePath, "AGENTS.md"), "utf8")).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("stages a seeded git workspace for cases with a workspace block", async () => {
    const repoRoot = await writeRepoFixture();
    await writeSeedFixture(repoRoot, "demo-seed");
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const seededCase = await laneRun.prepareCase(
      triggerCase("seeded-case", "invoke", {
        workspace: { seed: "demo-seed", branch: "main", committed: {}, staged: {} },
      }),
      1,
    );

    // A seeded case gets its own copy instead of the base workspace plain cases share.
    const plainCase = await laneRun.prepareCase(triggerCase("plain-case", "skip"), 1);
    expect(seededCase.workspacePath).not.toBe(plainCase.workspacePath);
    // Harness surfaces still accompany the seeded project.
    await expect(
      readFile(path.join(seededCase.workspacePath, ".claude", "settings.json"), "utf8"),
    ).resolves.toContain("disableBundledSkills");
  });

  it("evaluates Claude-only plugins without Codex metadata", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const lane = createClaudeLane();

    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("claude", repoRoot, "plugins/demo/skills/auto-skill"),
    );

    expect(laneRun.stagedSkillLabels).toStrictEqual(new Set(["demo:auto-skill"]));
  });
});

describe("observeClaudeOutput", () => {
  it("reports an is_error result as a runtime error signal", () => {
    // Recorded shape from the run in #168: init, one synthetic assistant text event carrying the
    // error, then a result with subtype success but is_error true.
    const errorText =
      "API Error: 500 Internal server error. This is a server-side issue, usually temporary.";
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init", skills: ["demo:auto-skill"] }),
      JSON.stringify({
        type: "assistant",
        message: { model: "<synthetic>", content: [{ type: "text", text: errorText }] },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        terminal_reason: "api_error",
        result: errorText,
      }),
    ].join("\n");

    const observations = observeClaudeOutput(stdout);

    expect(observations.signal).toBe("none");
    expect(observations.errorSignal).toBe(errorText);
    expect(observations.hasActivity).toBe(true);
  });

  it.each([
    [
      "quotes a fallback when an is_error result carries no text",
      {
        subtype: "error_during_execution",
        is_error: true,
        terminal_reason: "aborted_tools",
        result: "",
      },
      "result reported an error",
    ],
    [
      "reports no error signal for a completed result",
      { subtype: "success", is_error: false, result: "done" },
      undefined,
    ],
  ])("%s", (_label, result, errorSignal) => {
    const stdout = JSON.stringify({ type: "result", ...result });

    expect(observeClaudeOutput(stdout).errorSignal).toBe(errorSignal);
  });

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
    const stdout = assistantEvent([
      { type: "tool_use", name: "Skill", input: { skill: "demo:auto-skill" } },
    ]);

    expect(observeClaudeOutput(stdout).invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  // The trigger decision is the first assistant message with Skill calls; a later Skill message
  // that lands before the runner's stop takes effect is workflow behavior. Recorded 2026-09-24 on
  // Claude Code 2.1.281 (tdd documentation-only-change): stream-json emits each content block of
  // one message as its own assistant event under the shared message id, with tool results between
  // them.
  it("keeps only the Skill calls of the first assistant message that has any", () => {
    const stdout = [
      assistantEvent([{ type: "text", text: "Looking around first." }], "msg_0"),
      assistantEvent([skillCall("demo:auto-skill")], "msg_1"),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result" }] } }),
      assistantEvent([skillCall("demo:helper-skill")], "msg_1"),
      assistantEvent([skillCall("demo:other-skill")], "msg_2"),
    ].join("\n");

    expect(observeClaudeOutput(stdout).invokedSkills).toStrictEqual([
      "demo:auto-skill",
      "demo:helper-skill",
    ]);
  });

  it("keeps only the first Skill event when assistant events carry no message id", () => {
    const stdout = [
      assistantEvent([skillCall("demo:auto-skill")]),
      assistantEvent([skillCall("demo:other-skill")]),
    ].join("\n");

    expect(observeClaudeOutput(stdout).invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  it.each([
    [
      "reconnaissance paired with narration and text mentioning a label",
      0,
      [
        [
          { type: "text", text: "I could use demo:auto-skill here." },
          { type: "tool_use", name: "Read", input: { file_path: "demo:auto-skill" } },
        ],
      ],
    ],
    [
      "thinking and read-only reconnaissance",
      0,
      [
        [{ type: "thinking", thinking: "inspect first" }],
        [{ type: "tool_use", name: "Read", input: {} }],
        [{ type: "tool_use", name: "Glob", input: {} }],
        [{ type: "tool_use", name: "Grep", input: {} }],
      ],
    ],
    [
      "assistant text messages",
      3,
      [
        [{ type: "text", text: "step" }],
        [{ type: "text", text: "step" }],
        [{ type: "text", text: "step" }],
      ],
    ],
    ["a non-read tool call", 1, [[{ type: "tool_use", name: "Bash", input: { command: "pwd" } }]]],
  ])("gives %s a decision count of %i", (_label, decisionItemCount, messages) => {
    const observations = observeClaudeOutput(
      messages.map((content) => assistantEvent(content)).join("\n"),
    );

    expect(observations.decisionItemCount).toBe(decisionItemCount);
    // Neither text naming a label nor a read of it is a Skill tool call.
    expect(observations.signal).toBe("none");
    expect(observations.invokedSkills).toStrictEqual([]);
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

  it("reads the resolved model and Claude Code version from the init event", () => {
    // Recorded 2026-10-02: the opus alias as Claude Code 2.1.286 reports it.
    const stdout = JSON.stringify({
      type: "system",
      subtype: "init",
      model: "claude-opus-5-5",
      claude_code_version: "2.1.286",
      skills: [],
    });

    const observations = observeClaudeOutput(stdout);

    expect(observations.resolvedModel).toBe("claude-opus-5-5");
    expect(observations.agentVersion).toBe("Claude Code 2.1.286");
  });

  it("reports no loaded skills or activity for an empty run", () => {
    const observations = observeClaudeOutput("");

    expect(observations.loadedSkills).toBeUndefined();
    expect(observations.hasActivity).toBe(false);
    expect(observations.decisionItemCount).toBe(0);
  });

  it("preserves a skill invocation at the decision-item budget", () => {
    const assistantText = assistantEvent([{ type: "text", text: "step" }]);
    const stdout = [
      assistantText,
      assistantText,
      assistantText,
      assistantText,
      skillToolUseEvent("demo:auto-skill").trim(),
    ].join("\n");

    const observations = observeClaudeOutput(stdout);

    expect(observations.decisionItemCount).toBe(5);
    expect(observations.invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });
});
