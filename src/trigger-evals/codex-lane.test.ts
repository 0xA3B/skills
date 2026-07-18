import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCodexLane, observeCodexOutput } from "./codex-lane.js";
import type { StreamingCliOptions, StreamingCliResult } from "./exec.js";
import type { LaneRunOptions } from "./lanes.js";
import { resolveSkillTarget, skillTargetLabel } from "./target.js";
import {
  agentMessageEvent,
  frontmatterDescription,
  writeRepoFixture,
  writeRepoLocalSkillFixture,
} from "./test-utils.js";
import type { SkillTarget } from "./types.js";

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
        stdout: agentMessageEvent("I handled the request."),
        stderr: "",
        endedBy: "completed",
      };
    }),
  };
});

async function makeSourceCodexHome(): Promise<string> {
  const sourceCodexHome = await mkdtemp(path.join(os.tmpdir(), "source-codex-home-"));
  await writeFile(path.join(sourceCodexHome, "auth.json"), "{}");
  return sourceCodexHome;
}

async function makeRunOptions(
  repoRoot: string,
  skillPath: string,
  overrides: Partial<LaneRunOptions> = {},
): Promise<LaneRunOptions> {
  return {
    runDir: await mkdtemp(path.join(os.tmpdir(), "codex-lane-run-")),
    target: resolveSkillTarget(repoRoot, skillPath),
    model: "gpt-5.6-sol",
    effort: "medium",
    ...overrides,
  };
}

async function readStagedCanary(
  workspacePath: string,
  pluginName: string,
  skillName: string,
): Promise<string> {
  const skillBody = await readFile(
    path.join(workspacePath, "plugins", pluginName, "skills", skillName, "SKILL.md"),
    "utf8",
  );
  const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
  expect(canary).toBeDefined();
  return canary ?? "missing-canary";
}

function observeFor(target: SkillTarget, canaryLabels: ReadonlyMap<string, string>) {
  return (stdout: string, stderr = "") =>
    observeCodexOutput({ stdout, stderr }, target, skillTargetLabel(target), canaryLabels);
}

describe("createCodexLane", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  it("stages Codex surfaces, plugin caches, and canaries for plugin targets", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    const laneCase = await laneRun.prepareCase({
      id: "invoke-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    // Codex-only surfaces: the eval marketplace catalog, no Claude settings.
    const catalog = JSON.parse(
      await readFile(
        path.join(laneCase.workspacePath, ".agents", "plugins", "marketplace.json"),
        "utf8",
      ),
    ) as { plugins: Array<{ name: string }> };
    expect(catalog.plugins.map((plugin) => plugin.name)).toStrictEqual(["demo"]);
    await expect(
      readFile(path.join(laneCase.workspacePath, ".claude", "settings.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/);

    const canary = await readStagedCanary(laneCase.workspacePath, "demo", "auto-skill");
    const codexHome = path.join(runOptions.runDir, "codex-home", "cases", "invoke-case");
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('model = "gpt-5.6-sol"');
    expect(config).toContain('model_reasoning_effort = "medium"');
    expect(config).toContain('[plugins."demo@trigger-eval"]');
    const cachedSkill = await readFile(
      path.join(
        codexHome,
        "plugins",
        "cache",
        "trigger-eval",
        "demo",
        "1.0.0",
        "skills",
        "auto-skill",
        "SKILL.md",
      ),
      "utf8",
    );
    expect(cachedSkill).toContain(canary);

    const call = spawnCalls[0];
    expect(call?.command).toBe("codex");
    expect(call?.args).toContain("read-only");
    expect(call?.args?.at(-1)).toBe("Invoke the skill.");
    expect(call?.options.env["CODEX_HOME"]).toBe(codexHome);
    expect(call?.options.cwd).toBe(laneCase.workspacePath);

    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).resolves.toBe("{}");
    await laneCase.cleanup();
    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("isolates each concurrent case in its own CODEX_HOME", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const invokeCase = await laneRun.prepareCase({
      id: "invoke-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });
    const skipCase = await laneRun.prepareCase({
      id: "skip-case",
      prompt: "Do not invoke the skill.",
      expect: "skip",
    });
    await invokeCase.execute({
      caseDir: await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-")),
      timeoutMs: 60_000,
    });
    await skipCase.execute({
      caseDir: await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-")),
      timeoutMs: 60_000,
    });

    // Sharing a CODEX_HOME would let one case's auth cleanup race a sibling still executing.
    const codexHomes = spawnCalls.map((call) => call.options.env["CODEX_HOME"]);
    expect(new Set(codexHomes).size).toBe(2);
    expect(codexHomes[0]).toContain(path.join("cases", "invoke-case"));
    expect(codexHomes[1]).toContain(path.join("cases", "skip-case"));
  });

  it("removes the copied auth when case setup fails after the auth copy", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    // Deleting the committed plugin directory makes the plugin-cache staging step throw after
    // prepareCodexHome has already copied the user's auth.json into the per-case home.
    await rm(path.join(repoRoot, "plugins", "demo"), { recursive: true, force: true });

    await expect(
      laneRun.prepareCase({ id: "invoke-case", prompt: "Invoke the skill.", expect: "invoke" }),
    ).rejects.toThrow(/ENOENT/);
    await expect(
      readFile(
        path.join(runOptions.runDir, "codex-home", "cases", "invoke-case", "auth.json"),
        "utf8",
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it("observes staged canaries in agent output, attributing siblings distinctly", async () => {
    const repoRoot = await writeRepoFixture({ siblingSkills: [{ name: "sibling-skill" }] });
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase({
      id: "invoke-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });
    const targetCanary = await readStagedCanary(laneCase.workspacePath, "demo", "auto-skill");
    const siblingCanary = await readStagedCanary(laneCase.workspacePath, "demo", "sibling-skill");

    expect(laneRun.stagedSkillLabels).toStrictEqual(
      new Set(["demo:auto-skill", "demo:sibling-skill"]),
    );
    const targetOnly = laneCase.observe({ stdout: agentMessageEvent(targetCanary), stderr: "" });
    expect(targetOnly.signal).toBe("stdout-skill-canary");
    expect(targetOnly.invokedSkills).toStrictEqual(["demo:auto-skill"]);
    const siblingOnly = laneCase.observe({
      stdout: agentMessageEvent(siblingCanary),
      stderr: "",
    });
    expect(siblingOnly.invokedSkills).toStrictEqual(["demo:sibling-skill"]);
    const both = laneCase.observe({
      stdout: agentMessageEvent(`${targetCanary} and ${siblingCanary}`),
      stderr: "",
    });
    expect(both.invokedSkills.sort()).toStrictEqual(["demo:auto-skill", "demo:sibling-skill"]);
  });

  it("stages every marketplace plugin and canaries cross-plugin skills", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, "plugins/demo/skills/auto-skill", {
      extraPlugins: [{ pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") }],
    });

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase({
      id: "skip-case",
      prompt: "Do not invoke the skill.",
      expect: "skip",
    });

    const catalog = JSON.parse(
      await readFile(
        path.join(laneCase.workspacePath, ".agents", "plugins", "marketplace.json"),
        "utf8",
      ),
    ) as { plugins: Array<{ name: string }> };
    expect(catalog.plugins.map((plugin) => plugin.name)).toStrictEqual(["demo", "other"]);

    // Cross-plugin wrong-skill detection: the other plugin's canary is a recognized invocation.
    const otherCanary = await readStagedCanary(laneCase.workspacePath, "other", "other-skill");
    const observed = laneCase.observe({ stdout: agentMessageEvent(otherCanary), stderr: "" });
    expect(observed.invokedSkills).toStrictEqual(["other:other-skill"]);

    const codexHome = path.join(runOptions.runDir, "codex-home", "cases", "skip-case");
    const cachedOtherSkill = await readFile(
      path.join(
        codexHome,
        "plugins",
        "cache",
        "trigger-eval",
        "other",
        "2.0.0",
        "skills",
        "other-skill",
        "SKILL.md",
      ),
      "utf8",
    );
    expect(cachedOtherSkill).toContain(otherCanary);
  });

  it("stages repo-local targets under .agents with a per-case description canary", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeRunOptions(repoRoot, ".agents/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    const laneCase = await laneRun.prepareCase({
      id: "repo-local-case",
      prompt: "Invoke the skill.",
      expect: "invoke",
    });
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    const skillBody = await readFile(
      path.join(laneCase.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
    expect(canary).toBeDefined();
    const description = frontmatterDescription(skillBody);
    expect(description).toContain(`Eval only: if used, first output ${canary}.`);
    expect(description).toContain("Use when the user asks to invoke this repo-local skill.");
    // Codex drops descriptions past its length limit, which would silently lose the canary.
    expect(description.length).toBeLessThanOrEqual(1024);
    await expect(
      readFile(
        path.join(laneCase.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow(/ENOENT/);

    // Repo-local runs must be able to write in the workspace under test.
    expect(spawnCalls[0]?.args).toContain("workspace-write");

    const observed = laneCase.observe({
      stdout: agentMessageEvent(canary ?? "missing-canary"),
      stderr: "",
    });
    expect(observed.signal).toBe("stdout-skill-canary");
    expect(observed.invokedSkills).toStrictEqual(["auto-skill"]);
  });
});

describe("observeCodexOutput", () => {
  const repoTarget: SkillTarget = {
    kind: "plugin",
    repoRoot: "/repo",
    pluginName: "demo",
    skillName: "auto-skill",
    pluginPath: "/repo/plugins/demo",
    skillPath: "/repo/plugins/demo/skills/auto-skill",
    skillFilePath: "/repo/plugins/demo/skills/auto-skill/SKILL.md",
    metadataPath: "/repo/plugins/demo/skills/auto-skill/agents/openai.yaml",
    fixturePath: "/repo/plugins/demo/skills/auto-skill/evals/triggers.yaml",
  };
  const canaryLabels = new Map([
    ["trigger-eval-canary-target", "demo:auto-skill"],
    ["trigger-eval-canary-sibling", "demo:auto-skill-extra"],
  ]);
  const observe = observeFor(repoTarget, canaryLabels);

  it("boundary-matches labels in legacy stderr telemetry", () => {
    // The telemetry names the sibling demo:auto-skill-extra; the target demo:auto-skill must not
    // be credited from inside the longer label.
    const observed = observe(
      agentMessageEvent("I handled the request."),
      "codex.skill.injected demo:auto-skill-extra",
    );

    expect(observed.signal).toBe("stderr-skill-injected");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill-extra"]);
  });

  it("classifies target invocations from legacy stderr telemetry", () => {
    const observed = observe(
      agentMessageEvent("I handled the request."),
      "codex.skill.injected demo:auto-skill",
    );

    expect(observed.signal).toBe("stderr-skill-injected");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  it("prefers the canary signal over stderr telemetry", () => {
    const observed = observe(
      agentMessageEvent("trigger-eval-canary-target"),
      "codex.skill.injected demo:auto-skill-extra",
    );

    expect(observed.signal).toBe("stdout-skill-canary");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  it("excludes reasoning items from the decision count and sees turn activity", () => {
    const reasoningEvent = JSON.stringify({
      type: "item.completed",
      item: { type: "reasoning", text: "thinking" },
    });
    const commandEvent = JSON.stringify({
      type: "item.completed",
      item: { type: "command_execution", command: "ls" },
    });
    const turnEvent = JSON.stringify({ type: "turn.completed" });

    const observed = observe([reasoningEvent, reasoningEvent, commandEvent, turnEvent].join("\n"));

    expect(observed.decisionItemCount).toBe(1);
    expect(observed.hasActivity).toBe(true);
    expect(observed.signal).toBe("none");
    expect(observed.loadedSkills).toBeUndefined();
  });

  it("reports no activity for an empty run", () => {
    const observed = observe("");

    expect(observed.hasActivity).toBe(false);
    expect(observed.decisionItemCount).toBe(0);
  });
});
