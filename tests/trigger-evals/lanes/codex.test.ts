import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Skill, formatSkillLabel } from "../../../src/skills/index.js";
import { caseAttemptKey } from "../../../src/trigger-evals/fixtures/index.js";
import {
  CODEX_SKIP_DECISION_ITEM_BUDGET,
  createCodexLane,
  observeCodexOutput,
  skillFileReadPattern,
} from "../../../src/trigger-evals/lanes/codex.js";
import type {
  StreamingCliOptions,
  StreamingCliResult,
} from "../../../src/trigger-evals/lanes/exec.js";
import { createRuntimeResources } from "../../../src/trigger-evals/runtime.js";
import {
  agentMessageEvent,
  commandExecutionEvent,
  exists,
  makeLaneRunOptions,
  triggerCase,
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
    readCliVersion: vi.fn<(command: string) => Promise<string>>(async (command) =>
      command === "codex" ? "codex-cli 0.159.3" : `unexpected ${command}`,
    ),
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

// The Codex home of a case's first attempt.
function caseCodexHome(runDir: string, caseId: string): string {
  return path.join(runDir, "codex-home", "cases", caseId, "attempt-1");
}

// A skill file in a case home's plugin cache, the copy Codex actually loads.
function cachedSkillFile(
  codexHome: string,
  pluginName: string,
  version: string,
  skillName: string,
): string {
  return path.join(
    codexHome,
    "plugins",
    "cache",
    "trigger-eval",
    pluginName,
    version,
    "skills",
    skillName,
    "SKILL.md",
  );
}

// Plugin copies and the eval marketplace catalog live in the deployment directory outside the
// case cwd, which the generated config names as the local marketplace source.
async function readDeploymentPath(runDir: string, caseId: string): Promise<string> {
  const config = await readFile(path.join(caseCodexHome(runDir, caseId), "config.toml"), "utf8");
  const source = config.match(/^source = (?<source>".*")$/m)?.groups?.["source"];
  expect(source).toBeDefined();
  return JSON.parse(source ?? '""') as string;
}

async function readStagedCanary(
  deploymentPath: string,
  pluginName: string,
  skillName: string,
): Promise<string> {
  const skillBody = await readFile(
    path.join(deploymentPath, "plugins", pluginName, "skills", skillName, "SKILL.md"),
    "utf8",
  );
  const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
  expect(canary).toBeDefined();
  return canary ?? "missing-canary";
}

function observeFor(
  target: Skill,
  canaryLabels: ReadonlyMap<string, string>,
  skillFilePatterns: ReadonlyMap<string, RegExp> = new Map(),
) {
  return (stdout: string, stderr = "") =>
    observeCodexOutput(
      { stdout, stderr },
      target,
      formatSkillLabel(target),
      canaryLabels,
      skillFilePatterns,
    );
}

describe("createCodexLane", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  it("passes the staged skills' dependencies to the run", async () => {
    const repoRoot = await writeRepoFixture({ siblingSkills: [{ name: "helper-skill" }] });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );
    await writeFile(
      runOptions.target.skillFilePath,
      "---\nname: auto-skill\n---\nUse `helper-skill`.\n",
    );

    const laneRun = await createCodexLane({
      sourceCodexHome: await makeSourceCodexHome(),
    }).prepareRun(runOptions);

    expect(laneRun.skillDependencies.get("demo:auto-skill")).toStrictEqual(
      new Set(["demo:helper-skill"]),
    );
  });

  it("stages Codex surfaces, plugin caches, and canaries for plugin targets", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    expect(laneRun.skipDecisionItemBudget).toBe(CODEX_SKIP_DECISION_ITEM_BUDGET);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    // Codex-only surfaces: the eval marketplace catalog, no Claude settings. Both live in the
    // deployment directory, so the case cwd holds only fixture workspace files.
    const deploymentPath = await readDeploymentPath(runOptions.runDir, "invoke-case");
    expect(deploymentPath.startsWith(`${laneCase.workspacePath}${path.sep}`)).toBe(false);
    const catalog = JSON.parse(
      await readFile(path.join(deploymentPath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string }> };
    expect(catalog.plugins.map((plugin) => plugin.name)).toStrictEqual(["demo"]);
    await expect(
      readFile(path.join(laneCase.workspacePath, ".claude", "settings.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
    await expect(
      readFile(path.join(laneCase.workspacePath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/);

    const canary = await readStagedCanary(deploymentPath, "demo", "auto-skill");
    const codexHome = caseCodexHome(runOptions.runDir, "invoke-case");
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('model = "gpt-6-sol"');
    expect(config).toContain('model_reasoning_effort = "medium"');
    expect(config).toContain('[plugins."demo@trigger-eval"]');
    await expect(
      readFile(cachedSkillFile(codexHome, "demo", "1.0.0", "auto-skill"), "utf8"),
    ).resolves.toContain(canary);

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

  it("reports the Codex CLI version for the run", async () => {
    const repoRoot = await writeRepoFixture();
    const lane = createCodexLane({ sourceCodexHome: await makeSourceCodexHome() });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);

    expect(laneRun.agentVersion).toBe("codex-cli 0.159.3");
    await laneRun.cleanup();
    await runOptions.runtime.release();
  });

  it("isolates each concurrent case in its own CODEX_HOME", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const invokeCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    const secondInvokeAttempt = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 2);
    const skipCase = await laneRun.prepareCase(triggerCase("skip-case", "skip"), 1);
    for (const laneCase of [invokeCase, secondInvokeAttempt, skipCase]) {
      await laneCase.execute({
        caseDir: await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-")),
        timeoutMs: 60_000,
      });
    }

    // Sharing a CODEX_HOME would let one attempt's auth cleanup race a sibling still executing,
    // including another attempt of the same case.
    const codexHomes = spawnCalls.map((call) => call.options.env["CODEX_HOME"]);
    expect(codexHomes).toStrictEqual([
      caseCodexHome(runOptions.runDir, "invoke-case"),
      path.join(runOptions.runDir, "codex-home", "cases", "invoke-case", "attempt-2"),
      caseCodexHome(runOptions.runDir, "skip-case"),
    ]);
  });

  it("removes the copied auth when case setup fails after the auth copy", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    // Deleting the committed plugin directory makes the plugin-cache staging step throw after
    // prepareCodexHome has already copied the user's auth.json into the per-case home.
    await rm(path.join(repoRoot, "plugins", "demo"), { recursive: true, force: true });

    await expect(laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1)).rejects.toThrow(
      /ENOENT/,
    );
    const codexHome = caseCodexHome(runOptions.runDir, "invoke-case");
    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).rejects.toThrow(/ENOENT/);
    // The half-built case home was tracked under the case scope before the failure, so releasing
    // that case alone removes it.
    await runOptions.runtime.release(caseAttemptKey("invoke-case", 1));
    expect(await exists(codexHome)).toBe(false);
  });

  it("tracks the workspace root, the run home, and each case home for release", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    await laneCase.execute({
      caseDir: await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-")),
      timeoutMs: 60_000,
    });
    await laneCase.cleanup();
    const caseHome = caseCodexHome(runOptions.runDir, "invoke-case");
    const runHome = path.join(runOptions.runDir, "codex-home");
    const workspaceRoot = path.dirname(laneCase.workspacePath);
    expect(await exists(caseHome)).toBe(true);

    // The case scope releases only that case's home; the run scope takes the rest.
    await expect(
      runOptions.runtime.release(caseAttemptKey("invoke-case", 1)),
    ).resolves.toStrictEqual([]);
    expect(await exists(caseHome)).toBe(false);
    expect(await exists(runHome)).toBe(true);
    expect(await exists(workspaceRoot)).toBe(true);

    await expect(runOptions.runtime.release()).resolves.toStrictEqual([]);
    expect(await exists(runHome)).toBe(false);
    expect(await exists(workspaceRoot)).toBe(false);
  });

  it("retains runtime homes but never the copied auth when release keeps them", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
      {
        runtime: createRuntimeResources({ keep: true }),
      },
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    await laneCase.cleanup();
    await laneRun.cleanup();
    await runOptions.runtime.release(caseAttemptKey("invoke-case", 1));
    await runOptions.runtime.release();

    const caseHome = caseCodexHome(runOptions.runDir, "invoke-case");
    expect(await exists(path.join(caseHome, "config.toml"))).toBe(true);
    expect(await exists(path.join(caseHome, "auth.json"))).toBe(false);
    expect(await exists(path.dirname(laneCase.workspacePath))).toBe(true);
  });

  it("writes final.txt from the last agent message when the CLI wrote none", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("codex", repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const laneCase = await laneRun.prepareCase(triggerCase("skip-case", "skip"), 1);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));

    // The faked codex exec never writes its -o file, as a run stopped at the first invocation
    // signal or the decision-item budget never does.
    const runResult = await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    expect(runResult.finalMessagePath).toBe(path.join(caseDir, "final.txt"));
    await expect(readFile(runResult.finalMessagePath, "utf8")).resolves.toBe(
      "I handled the request.",
    );
    expect(runResult.finalMessage).toBe("I handled the request.");
  });

  it("falls back to the parsed last message when final.txt is unreadable for another reason", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("codex", repoRoot, "plugins/demo/skills/auto-skill"),
    );
    const laneCase = await laneRun.prepareCase(triggerCase("skip-case", "skip"), 1);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    // A directory at the -o path fails the read with EISDIR, which is not a missing file.
    await mkdir(path.join(caseDir, "final.txt"));

    const runResult = await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    expect(runResult.finalMessage).toBe("I handled the request.");
    expect((await stat(path.join(caseDir, "final.txt"))).isDirectory()).toBe(true);
  });

  it("observes staged canaries in agent output, attributing siblings distinctly", async () => {
    const repoRoot = await writeRepoFixture({ siblingSkills: [{ name: "sibling-skill" }] });
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("invoke-case", "invoke"), 1);
    const deploymentPath = await readDeploymentPath(runOptions.runDir, "invoke-case");
    const targetCanary = await readStagedCanary(deploymentPath, "demo", "auto-skill");
    const siblingCanary = await readStagedCanary(deploymentPath, "demo", "sibling-skill");

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
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
      {
        extraPlugins: [
          { pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") },
        ],
      },
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("skip-case", "skip"), 1);

    const deploymentPath = await readDeploymentPath(runOptions.runDir, "skip-case");
    const catalog = JSON.parse(
      await readFile(path.join(deploymentPath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string }> };
    expect(catalog.plugins.map((plugin) => plugin.name)).toStrictEqual(["demo", "other"]);

    // Cross-plugin wrong-skill detection: the other plugin's canary is a recognized invocation.
    const otherCanary = await readStagedCanary(deploymentPath, "other", "other-skill");
    const observed = laneCase.observe({ stdout: agentMessageEvent(otherCanary), stderr: "" });
    expect(observed.invokedSkills).toStrictEqual(["other:other-skill"]);

    const codexHome = caseCodexHome(runOptions.runDir, "skip-case");
    await expect(
      readFile(cachedSkillFile(codexHome, "other", "2.0.0", "other-skill"), "utf8"),
    ).resolves.toContain(otherCanary);
  });

  it("stages a seeded git workspace for plugin cases with a workspace block", async () => {
    const repoRoot = await writeRepoFixture();
    await writeSeedFixture(repoRoot, "demo-seed");
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const seeded = triggerCase("seeded-case", "invoke", {
      workspace: { seed: "demo-seed", branch: "main", committed: {}, staged: {} },
    });
    const seededCase = await laneRun.prepareCase(seeded, 1);
    const secondAttempt = await laneRun.prepareCase(seeded, 2);

    // A seeded case gets its own copy per attempt instead of the base workspace plain cases share.
    const plainCase = await laneRun.prepareCase(triggerCase("plain-case", "skip"), 1);
    expect(seededCase.workspacePath).not.toBe(plainCase.workspacePath);
    expect(seededCase.workspacePath).toContain(path.join("seeded-case", "attempt-1", "workspace"));
    expect(secondAttempt.workspacePath).toContain(
      path.join("seeded-case", "attempt-2", "workspace"),
    );
    // The seeded cwd is trusted in the case config, and plugins stay outside it.
    const config = await readFile(
      path.join(caseCodexHome(runOptions.runDir, "seeded-case"), "config.toml"),
      "utf8",
    );
    expect(config).toContain(`[projects.${JSON.stringify(seededCase.workspacePath)}]`);
    await expect(stat(path.join(seededCase.workspacePath, "plugins"))).rejects.toThrow(/ENOENT/);
  });

  it("stages plugins plus repo-local siblings for repo-local targets and merges canaries", async () => {
    const repoRoot = await writeRepoLocalSkillFixture({
      marketplace: true,
      siblingSkills: [{ name: "sibling-skill" }, { name: "manual-skill", manualOnly: true }],
    });
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions("codex", repoRoot, ".agents/skills/auto-skill", {
      extraPlugins: [{ pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") }],
      extraRepoLocalSkills: [
        {
          skillName: "sibling-skill",
          skillPath: path.join(repoRoot, ".agents", "skills", "sibling-skill"),
        },
        {
          skillName: "manual-skill",
          skillPath: path.join(repoRoot, ".agents", "skills", "manual-skill"),
        },
      ],
    });

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("repo-local-case", "invoke"), 1);

    expect(laneRun.stagedSkillLabels).toStrictEqual(
      new Set(["other:other-skill", "auto-skill", "sibling-skill", "manual-skill"]),
    );
    const deploymentPath = await readDeploymentPath(runOptions.runDir, "repo-local-case");
    const catalog = JSON.parse(
      await readFile(path.join(deploymentPath, ".agents", "plugins", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string }> };
    expect(catalog.plugins.map((plugin) => plugin.name)).toStrictEqual(["other"]);
    const codexHome = caseCodexHome(runOptions.runDir, "repo-local-case");
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('[plugins."other@trigger-eval"]');

    // The per-case target canary merges with the per-run plugin canaries, so a plugin skill
    // stealing the invocation stays attributable alongside the target's own signal.
    const stagedCanary = async (skillName: string) => {
      const skillBody = await readFile(
        path.join(laneCase.workspacePath, ".agents", "skills", skillName, "SKILL.md"),
        "utf8",
      );
      const canary = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/)?.[0];
      expect(canary).toBeDefined();
      return canary ?? "missing-canary";
    };
    const targetCanary = await stagedCanary("auto-skill");
    const otherCanary = await readStagedCanary(deploymentPath, "other", "other-skill");
    expect(
      laneCase.observe({ stdout: agentMessageEvent(targetCanary), stderr: "" }).invokedSkills,
    ).toStrictEqual(["auto-skill"]);
    expect(
      laneCase.observe({ stdout: agentMessageEvent(otherCanary), stderr: "" }).invokedSkills,
    ).toStrictEqual(["other:other-skill"]);

    // The Codex plugin cache is what actually makes the staged plugin loadable; repo-local
    // targets must stage it too, with the canary present in the cached copy.
    await expect(
      readFile(cachedSkillFile(codexHome, "other", "2.0.0", "other-skill"), "utf8"),
    ).resolves.toContain(otherCanary);

    // Implicitly invokable sibling repo-local skills carry their own canary, so a sibling
    // stealing the invocation is attributable.
    const siblingCanary = await stagedCanary("sibling-skill");
    expect(
      laneCase.observe({ stdout: agentMessageEvent(siblingCanary), stderr: "" }).invokedSkills,
    ).toStrictEqual(["sibling-skill"]);
    // Reading the staged sibling file is the same invocation; the read pattern is wired through
    // prepareRun for repo-local skills as well as plugins.
    const siblingRead = laneCase.observe({
      stdout: commandExecutionEvent("cat .agents/skills/sibling-skill/SKILL.md"),
      stderr: "",
    });
    expect(siblingRead.signal).toBe("command-skill-read");
    expect(siblingRead.invokedSkills).toStrictEqual(["sibling-skill"]);

    // A manual-only sibling keeps its real invocation policy: staged and labeled, but it can only
    // fire on explicit request, so reading it is not an implicit invocation.
    expect(
      laneCase.observe({
        stdout: commandExecutionEvent("cat .agents/skills/manual-skill/SKILL.md"),
        stderr: "",
      }).signal,
    ).toBe("none");
  });

  it("credits a command that reads the per-case plugin cache copy of a plugin skill", async () => {
    const repoRoot = await writeRepoFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions(
      "codex",
      repoRoot,
      "plugins/demo/skills/auto-skill",
    );

    const laneRun = await lane.prepareRun(runOptions);
    const laneCase = await laneRun.prepareCase(triggerCase("read-case", "invoke"), 1);
    const cachedFile = cachedSkillFile(
      caseCodexHome(runOptions.runDir, "read-case"),
      "demo",
      "1.0.0",
      "auto-skill",
    );
    expect(await exists(cachedFile)).toBe(true);

    const observed = laneCase.observe({
      stdout: commandExecutionEvent(`/bin/zsh -lc 'cat ${cachedFile}'`),
      stderr: "",
    });
    expect(observed.signal).toBe("command-skill-read");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill"]);
  });

  it("stages repo-local targets under .agents with a per-run body canary", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions("codex", repoRoot, ".agents/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    const laneCase = await laneRun.prepareCase(triggerCase("repo-local-case", "invoke"), 1);
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    const skillBody = await readFile(
      path.join(laneCase.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    const canaries = skillBody.match(/trigger-eval-canary-[a-z0-9-]+/g) ?? [];
    // Exactly one canary: the target is canaried once per run, never again as a sibling.
    expect(canaries).toHaveLength(1);
    const canary = canaries[0];
    // The committed skill, description included, stays a byte-identical prefix of the staged copy.
    const committedSkill = await readFile(
      path.join(repoRoot, ".agents", "skills", "auto-skill", "SKILL.md"),
      "utf8",
    );
    expect(skillBody.startsWith(committedSkill)).toBe(true);
    await expect(
      readFile(
        path.join(laneCase.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow(/ENOENT/);

    // Repo-local cases run read-only like plugin cases, so plain cases share the base workspace; a
    // per-case copy is reserved for cases with their own workspace content.
    const args = spawnCalls[0]?.args ?? [];
    expect(args[args.indexOf("-s") + 1]).toBe("read-only");
    const secondPlainCase = await laneRun.prepareCase(
      triggerCase("other-repo-local-case", "skip"),
      1,
    );
    expect(secondPlainCase.workspacePath).toBe(laneCase.workspacePath);

    const observed = laneCase.observe({
      stdout: agentMessageEvent(canary ?? "missing-canary"),
      stderr: "",
    });
    expect(observed.signal).toBe("stdout-skill-canary");
    expect(observed.invokedSkills).toStrictEqual(["auto-skill"]);
  });
});

describe("observeCodexOutput", () => {
  const repoTarget: Skill = {
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

  // The second row names the sibling demo:auto-skill-extra; the target demo:auto-skill must not be
  // credited from inside the longer label.
  it.each([
    ["the target", "codex.skill.injected demo:auto-skill", ["demo:auto-skill"]],
    [
      "a sibling whose label extends the target's",
      "codex.skill.injected demo:auto-skill-extra",
      ["demo:auto-skill-extra"],
    ],
  ])("credits %s from legacy stderr telemetry", (_label, stderr, invokedSkills) => {
    const observed = observe(agentMessageEvent("I handled the request."), stderr);

    expect(observed.signal).toBe("stderr-skill-injected");
    expect(observed.invokedSkills).toStrictEqual(invokedSkills);
  });

  it("classifies a command that reads a staged skill file as that skill's invocation", () => {
    // Recorded 2026-09-24 on gpt-6-sol: the model read the staged SKILL.md through the plugin
    // cache, then ignored the eval section's stop instruction and never output the canary.
    const readPatterns = new Map([
      ["demo:auto-skill", skillFileReadPattern("demo", "auto-skill")],
      ["demo:auto-skill-extra", skillFileReadPattern("demo", "auto-skill-extra")],
      ["local-skill", skillFileReadPattern(undefined, "local-skill")],
    ]);
    const observeReads = observeFor(repoTarget, canaryLabels, readPatterns);

    const cached = observeReads(
      commandExecutionEvent(
        "/bin/zsh -lc 'cat /run/codex-home/cases/x/plugins/cache/trigger-eval/demo/1.0.0/skills/auto-skill/SKILL.md'",
      ),
    );
    expect(cached.signal).toBe("command-skill-read");
    expect(cached.invokedSkills).toStrictEqual(["demo:auto-skill"]);

    // The sibling's longer skill name must not credit the target, and vice versa.
    const sibling = observeReads(
      commandExecutionEvent("sed -n 1,80p /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md"),
    );
    expect(sibling.invokedSkills).toStrictEqual(["demo:auto-skill-extra"]);

    const repoLocal = observeReads(
      commandExecutionEvent("cat .agents/skills/local-skill/SKILL.md"),
    );
    expect(repoLocal.invokedSkills).toStrictEqual(["local-skill"]);

    const unrelated = observeReads(
      [
        commandExecutionEvent("cat README.md"),
        commandExecutionEvent("cat /deploy/plugins/demo/skills/auto-skill/references/notes.md"),
        commandExecutionEvent("cat /deploy/plugins/other/skills/auto-skill/SKILL.md"),
      ].join("\n"),
    );
    expect(unrelated.signal).toBe("none");
    expect(unrelated.decisionItemCount).toBe(3);
  });

  it("marks a skill-file read pending until an assistant message follows it", () => {
    const readPatterns = new Map([
      ["demo:auto-skill", skillFileReadPattern("demo", "auto-skill")],
      ["demo:auto-skill-extra", skillFileReadPattern("demo", "auto-skill-extra")],
    ]);
    const observeReads = observeFor(repoTarget, canaryLabels, readPatterns);
    const readExtra = commandExecutionEvent(
      "cat /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md",
    );
    const readTarget = commandExecutionEvent("cat /deploy/plugins/demo/skills/auto-skill/SKILL.md");

    // A helper skill read first, then the workflow skill: both are attributed once the reads settle.
    const pending = observeReads(readExtra);
    expect(pending.pendingReads).toBe(true);
    const settled = observeReads(
      [readExtra, readTarget, agentMessageEvent("Loaded both.")].join("\n"),
    );
    expect(settled.pendingReads).toBe(false);
    // Read order, not staging order: the report and wrong-skill selection preserve it.
    expect(settled.invokedSkills).toStrictEqual(["demo:auto-skill-extra", "demo:auto-skill"]);
    // A message before the read does not settle it.
    expect(observeReads([agentMessageEvent("Looking."), readTarget].join("\n")).pendingReads).toBe(
      true,
    );
  });

  it("does not credit a skill-file read from a command that failed", () => {
    // Recorded 2026-09-24 on gpt-6-sol: `rg --files -g 'AGENTS.md' ... && cat <cache>/SKILL.md`
    // exited 1 because rg matched nothing, so the cat never ran and the skill was never loaded.
    const readPatterns = new Map([["demo:auto-skill", skillFileReadPattern("demo", "auto-skill")]]);
    const observeReads = observeFor(repoTarget, canaryLabels, readPatterns);
    const failedRead =
      "rg --files -g 'AGENTS.md' && cat /deploy/plugins/demo/skills/auto-skill/SKILL.md";

    const failed = observeReads(
      commandExecutionEvent(failedRead, { status: "failed", exitCode: 1 }),
    );
    expect(failed.signal).toBe("none");
    expect(failed.pendingReads).toBeUndefined();
    expect(failed.decisionItemCount).toBe(1);
    expect(
      observeReads(commandExecutionEvent(failedRead, { status: "completed", exitCode: 0 })).signal,
    ).toBe("command-skill-read");
  });

  it("keeps a skill-file read of another skill alongside the canary", () => {
    const readPatterns = new Map([
      ["demo:auto-skill-extra", skillFileReadPattern("demo", "auto-skill-extra")],
    ]);
    const observed = observeFor(
      repoTarget,
      canaryLabels,
      readPatterns,
    )(
      [
        commandExecutionEvent("cat /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md"),
        agentMessageEvent("trigger-eval-canary-target"),
      ].join("\n"),
    );

    expect(observed.signal).toBe("stdout-skill-canary");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill", "demo:auto-skill-extra"]);
    expect(observed.pendingReads).toBeUndefined();
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
    const turnEvent = JSON.stringify({ type: "turn.completed" });

    const observed = observe(
      [reasoningEvent, reasoningEvent, commandExecutionEvent("ls"), turnEvent].join("\n"),
    );

    expect(observed.decisionItemCount).toBe(1);
    expect(observed.hasActivity).toBe(true);
    expect(observed.signal).toBe("none");
    expect(observed.loadedSkills).toBeUndefined();
  });

  it("reports a failed turn as a runtime error signal", () => {
    // Documented `codex exec --json` shape; no recorded run under .local has produced it.
    const failed = observe(
      [
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({ type: "turn.failed", error: { message: "stream disconnected" } }),
      ].join("\n"),
    );

    expect(failed.errorSignal).toBe("stream disconnected");
    expect(failed.hasActivity).toBe(false);
  });

  it("ignores nonterminal error events such as retry notices", () => {
    const recovered = observe(
      [
        JSON.stringify({ type: "error", message: "Reconnecting... 2/5 (stream disconnected)" }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
        JSON.stringify({ type: "turn.completed" }),
      ].join("\n"),
    );

    expect(recovered.errorSignal).toBeUndefined();
    expect(recovered.hasActivity).toBe(true);
  });

  it("reports no activity for an empty run", () => {
    const observed = observe("");

    expect(observed.hasActivity).toBe(false);
    expect(observed.decisionItemCount).toBe(0);
  });
});
