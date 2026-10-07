import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { caseAttemptKey } from "../../../src/trigger-evals/fixtures/index.js";
import {
  CODEX_SKIP_DECISION_ITEM_BUDGET,
  createCodexLane,
  type InvocableSkill,
  observeCodexOutput,
} from "../../../src/trigger-evals/lanes/codex.js";
import type {
  StreamingCliOptions,
  StreamingCliResult,
} from "../../../src/trigger-evals/lanes/exec.js";
import { createRuntimeResources } from "../../../src/trigger-evals/runtime.js";
import { shouldStopEarly } from "../../../src/trigger-evals/verdict.js";
import {
  agentMessageEvent,
  commandExecutionEvent,
  exists,
  makeLaneRunOptions,
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
      runOptions.target.fixturePath,
      `applies:\n  - demo:helper-skill\n${triggerFixtureYaml()}`,
    );

    const laneRun = await createCodexLane({
      sourceCodexHome: await makeSourceCodexHome(),
    }).prepareRun(runOptions);

    expect(laneRun.skillDependencies.get("demo:auto-skill")).toStrictEqual(
      new Set(["demo:helper-skill"]),
    );
  });

  it("stages Codex surfaces and byte-identical plugin caches for plugin targets", async () => {
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

    const codexHome = caseCodexHome(runOptions.runDir, "invoke-case");
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('model = "gpt-6.1-sol"');
    expect(config).toContain('model_reasoning_effort = "medium"');
    expect(config).toContain('[plugins."demo@trigger-eval"]');
    await expect(
      readFile(cachedSkillFile(codexHome, "demo", "1.0.0", "auto-skill"), "utf8"),
    ).resolves.toBe(await readFile(runOptions.target.skillFilePath, "utf8"));

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

  it("attributes reads of the target and a sibling distinctly", async () => {
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
    const codexHome = caseCodexHome(runOptions.runDir, "invoke-case");
    const target = cachedSkillFile(codexHome, "demo", "1.0.0", "auto-skill");
    const sibling = cachedSkillFile(codexHome, "demo", "1.0.0", "sibling-skill");

    expect(laneRun.stagedSkillLabels).toStrictEqual(
      new Set(["demo:auto-skill", "demo:sibling-skill"]),
    );
    const read = (command: string) =>
      laneCase.observe({ stdout: commandExecutionEvent(command), stderr: "" }).invokedSkills;
    expect(read(`cat ${target}`)).toStrictEqual(["demo:auto-skill"]);
    expect(read(`cat ${sibling}`)).toStrictEqual(["demo:sibling-skill"]);
    expect(read(`cat ${sibling} ${target}`)).toStrictEqual([
      "demo:sibling-skill",
      "demo:auto-skill",
    ]);
  });

  it("stages every marketplace plugin and watches cross-plugin skills", async () => {
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

    // Cross-plugin wrong-skill detection: a read of the other plugin's cached skill is a
    // recognized invocation.
    const cachedOther = cachedSkillFile(
      caseCodexHome(runOptions.runDir, "skip-case"),
      "other",
      "2.0.0",
      "other-skill",
    );
    const observed = laneCase.observe({
      stdout: commandExecutionEvent(`cat ${cachedOther}`),
      stderr: "",
    });
    expect(observed.invokedSkills).toStrictEqual(["other:other-skill"]);
  });

  // The read matcher credits any file at a staged skill's path, so a workspace copy there would
  // turn a read of project content into a load.
  const shadowingFile = "plugins/demo/skills/auto-skill/SKILL.md";
  it.each([
    {
      layer: "a workspace file",
      extra: { workspaceFiles: { [shadowingFile]: "---\nname: auto-skill\n---\n" } },
    },
    {
      layer: "a seed file",
      extra: { workspace: { seed: "demo-seed", branch: "main", committed: {}, staged: {} } },
    },
  ])("refuses a case whose workspace puts $layer at a staged skill's path", async ({ extra }) => {
    const repoRoot = await writeRepoFixture();
    await writeSeedFixture(repoRoot, "demo-seed");
    const seedSkillFile = path.join(repoRoot, "evals", "seeds", "demo-seed", shadowingFile);
    await mkdir(path.dirname(seedSkillFile), { recursive: true });
    await writeFile(seedSkillFile, "---\nname: auto-skill\n---\n");
    const lane = createCodexLane({ sourceCodexHome: await makeSourceCodexHome() });
    const laneRun = await lane.prepareRun(
      await makeLaneRunOptions("codex", repoRoot, "plugins/demo/skills/auto-skill"),
    );

    await expect(laneRun.prepareCase(triggerCase("case", "skip", extra), 1)).rejects.toThrow(
      `"${shadowingFile}"`,
    );
    // A skill file of a plugin the run does not stage cannot be mistaken for a load.
    await expect(
      laneRun.prepareCase(
        triggerCase("unstaged-plugin", "skip", {
          workspaceFiles: { "plugins/unstaged/skills/auto-skill/SKILL.md": "body\n" },
        }),
        1,
      ),
    ).resolves.toBeDefined();
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

  it("stages plugins plus repo-local siblings for repo-local targets and watches both", async () => {
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

    // The Codex plugin cache is what actually makes the staged plugin loadable; repo-local
    // targets must stage it too, and a read of the cached copy is that plugin skill's invocation.
    const cachedOther = cachedSkillFile(codexHome, "other", "2.0.0", "other-skill");
    expect(await exists(cachedOther)).toBe(true);
    const read = (command: string) =>
      laneCase.observe({ stdout: commandExecutionEvent(command), stderr: "" });
    expect(read(`cat ${cachedOther}`).invokedSkills).toStrictEqual(["other:other-skill"]);
    expect(read("cat .agents/skills/auto-skill/SKILL.md").invokedSkills).toStrictEqual([
      "auto-skill",
    ]);
    // An implicitly invokable sibling is watched, so a sibling stealing the invocation is
    // attributable.
    expect(read("cat .agents/skills/sibling-skill/SKILL.md").invokedSkills).toStrictEqual([
      "sibling-skill",
    ]);
    // A manual-only sibling keeps its real invocation policy: staged and labeled, but it can only
    // fire on explicit request, so reading it is not an implicit invocation.
    expect(read("cat .agents/skills/manual-skill/SKILL.md").signal).toBe("none");
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

  it("stages repo-local targets byte-identical under .agents", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const sourceCodexHome = await makeSourceCodexHome();
    const lane = createCodexLane({ sourceCodexHome });
    const runOptions = await makeLaneRunOptions("codex", repoRoot, ".agents/skills/auto-skill");

    const laneRun = await lane.prepareRun(runOptions);
    const caseDir = await mkdtemp(path.join(os.tmpdir(), "codex-lane-case-"));
    const laneCase = await laneRun.prepareCase(triggerCase("repo-local-case", "invoke"), 1);
    await laneCase.execute({ caseDir, timeoutMs: 60_000 });

    await expect(
      readFile(
        path.join(laneCase.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe(await readFile(runOptions.target.skillFilePath, "utf8"));
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
  });
});

describe("observeCodexOutput", () => {
  const invocableSkills: InvocableSkill[] = [
    { skillLabel: "demo:auto-skill", pluginName: "demo", skillName: "auto-skill" },
    { skillLabel: "demo:auto-skill-extra", pluginName: "demo", skillName: "auto-skill-extra" },
    { skillLabel: "local-skill", skillName: "local-skill" },
  ];
  const observe = (stdout: string) => observeCodexOutput({ stdout, stderr: "" }, invocableSkills);
  const cachePath =
    "/run/codex-home/cases/x/attempt-1/plugins/cache/trigger-eval/demo/1.0.0/skills/auto-skill";

  // Each command is a recorded Codex form that loads the whole skill body from its first line.
  it.each([
    // 2026-10-03 prototype, both models: the plugin-cache copy read through the login shell.
    ["cat of the plugin-cache copy", `/opt/homebrew/bin/zsh -lc 'cat ${cachePath}/SKILL.md'`],
    // The dominant historical form: 1,058 of 1,285 recorded SKILL.md commands.
    ["a sed range from line 1", `/bin/zsh -lc "sed -n '1,240p' '${cachePath}/SKILL.md'"`],
    // 2026-10-03 prototype: a relative read after a cd in the same command.
    ["cat after a cd", `/opt/homebrew/bin/zsh -lc 'cd ${cachePath} && cat SKILL.md'`],
    ["numbered lines piped to a range", `nl -ba ${cachePath}/SKILL.md | sed -n '1,60p'`],
    ["head", `head -n 80 ${cachePath}/SKILL.md`],
    ["cat through an input redirection", `cat < ${cachePath}/SKILL.md`],
    ["a sed range from line 0", `sed -n '0,/^## Steps/p' ${cachePath}/SKILL.md`],
    [
      "a load on a later line",
      `/opt/homebrew/bin/zsh -lc 'ls ${cachePath}\ncat ${cachePath}/SKILL.md'`,
    ],
    ["a load continued across lines", `cat \\\n  ${cachePath}/SKILL.md`],
    // Codex aggregates stderr into the command output, so the body still reaches the agent.
    ["a cat to stderr", `cat ${cachePath}/SKILL.md >&2`],
    ["a cat with stderr discarded", `cat ${cachePath}/SKILL.md 2>/dev/null`],
    // A comment starts at a word, including one right after a `;`.
    ["a load after a comment that follows a ;", `true;# note\ncat ${cachePath}/SKILL.md`],
    // 2026-08-23 prose tighten-blog-intro: a quoted glob is the search's own, not a path.
    [
      "a load beside a file list with quoted globs",
      `sed -n '1,240p' ${cachePath}/SKILL.md && rg --files -g '*.md' -g '*.txt' .`,
    ],
  ])("credits %s as a load", (_form, command) => {
    const observed = observe(commandExecutionEvent(command));

    expect(observed.signal).toBe("command-skill-read");
    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill"]);
    expect(observed.unclassifiedSkillAccess).toBeUndefined();
  });

  // Each command names a staged skill file without loading its body as instructions.
  it.each([
    // 2026-10-03 prototype: Codex's own parser credits a partial range; this matcher does not.
    ["a range after line 1", `sed -n '2,3p' ${cachePath}/SKILL.md`],
    // 2026-10-02 gpt-6.1-sol, sync-upstream conceptual-question: read to explain a key.
    [
      "a mid-file range of a repo-local skill",
      "sed -n '18,38p' .agents/skills/local-skill/SKILL.md",
    ],
    // 2026-10-03 prototype: metadata reads.
    ["a listing", `ls -l ${cachePath}/SKILL.md`],
    ["a stat", `stat ${cachePath}/SKILL.md`],
    ["a line count", `wc -l ${cachePath}/SKILL.md`],
    ["a test", `test -f ${cachePath}/SKILL.md`],
    ["a bracket test", `[ -f ${cachePath}/SKILL.md ]`],
    ["a git diff", `git diff -- ${cachePath}/SKILL.md`],
    // 2026-09-07 gpt-6-sol, review-changes instruction-file-review: a workspace diff.
    ["a git diff of a bare skill file", "git diff -- SKILL.md"],
    [
      "a listing of a plugin's skills directory",
      "ls /run/plugins/cache/trigger-eval/demo/1.0.0/skills",
    ],
    ["a file list under the repo-local skills", "rg -l name .agents/skills"],
    ["a git log of names", "git log --oneline --name-only -- .agents/skills/local-skill/SKILL.md"],
    // 2026-10-04 gpt-6.1-sol: a status listing of the work tree.
    [
      "a git status listing",
      "git status --porcelain=v1 --untracked-files=all -- .agents/skills/local-skill/SKILL.md",
    ],
    // 2026-07-06 recorded form: a search for skill files by name.
    ["a find by name", `find ${cachePath} -name SKILL.md -print`],
    // 2026-07-04 add-skill update-plugin-metadata: a numbered read narrowed to later ranges.
    [
      "numbered lines piped to later ranges",
      `nl -ba ${cachePath}/SKILL.md | sed -n '88,102p;124,134p'`,
    ],
    ["a listing piped to a sort", `find ${cachePath} -name SKILL.md -print | sort`],
    ["a listing piped to a names search", `find ${cachePath} -name SKILL.md | grep -c auto`],
    // Searches read matching lines to answer a question.
    // 2026-10-03 prototype, both models: a search of the plugin-cache copy.
    ["a content search", `/opt/homebrew/bin/zsh -lc "rg -n 'Conventional' ${cachePath}/SKILL.md"`],
    // 2026-10-04 gpt-6.1-sol, add-skill add-trigger-evals attempts 1 and 4.
    [
      "a content search over two repo-local skills",
      "rg -n 'trigger|fixture|repo-local' .agents/skills/local-skill/SKILL.md .agents/skills/other/SKILL.md",
    ],
    ["a grep content search", `grep -n name ${cachePath}/SKILL.md`],
    ["a whole file piped to a content search", `cat ${cachePath}/SKILL.md | rg -n name`],
    // 2026-07-04 review-changes: a search over a skill directory.
    ["a content search over a skill directory", `rg -n "TODO|review" ${cachePath}`],
    // Searches that print only file names or counts.
    ["a count of every line", `grep -c '' ${cachePath}/SKILL.md`],
    ["a file list for any line", `rg -l '^' ${cachePath}/SKILL.md`],
    ["a file list in a flag cluster", `grep -il name ${cachePath}/SKILL.md`],
    ["a whole file piped to a count", `cat ${cachePath}/SKILL.md | rg -c name`],
    // 2026-10-02 gpt-6.1-sol, sync-upstream: a file list filtered by globs.
    ["a file list by name", "pwd && rg --files -g 'AGENTS.md' -g 'SKILL.md' | head -80"],
    // A form the classifier refuses still passes when it reaches no skill file, even under a
    // directory named skills.
    ["a refused form under a skills directory", "cat /src/skills/.local/notes.md || true"],
    ["a loop over files outside any skill", `for f in src/*.ts; do cat "$f"; done`],
  ])("does not credit %s", (_form, command) => {
    const observed = observe(commandExecutionEvent(command));

    expect(observed.signal).toBe("none");
    expect(observed.invokedSkills).toStrictEqual([]);
    expect(observed.unclassifiedSkillAccess).toBeUndefined();
  });

  it("does not credit a file outside the staged skills", () => {
    const observed = observe(
      [
        commandExecutionEvent("cat README.md"),
        commandExecutionEvent(`cat ${cachePath}/references/notes.md`),
        commandExecutionEvent("cat /deploy/plugins/other/skills/auto-skill/SKILL.md"),
        // A workspace file that is a skill body but not a staged one, read after a cd.
        commandExecutionEvent("cd skills/deploy && cat SKILL.md"),
      ].join("\n"),
    );

    expect(observed.signal).toBe("none");
    expect(observed.unclassifiedSkillAccess).toBeUndefined();
    expect(observed.decisionItemCount).toBe(4);
  });

  it("credits each load of a chained command in order, without crediting a longer sibling name", () => {
    const observed = observe(
      commandExecutionEvent(
        [
          `sed -n '1,240p' /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md`,
          `sed -n '241,520p' /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md`,
          "cat .agents/skills/local-skill/SKILL.md",
        ].join(" && "),
      ),
    );

    expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill-extra", "local-skill"]);
  });

  // A command the matcher cannot classify could be a load or not, so the verdict must not trust
  // either reading of the run.
  it.each([
    ["an awk read", `awk 'NR < 50' ${cachePath}/SKILL.md`],
    ["a loop over skill files", `for f in ${cachePath}/SKILL.md; do cat "$f"; done`],
    ["a sed script with a pattern address", `sed -n '/^## Steps/,$p' ${cachePath}/SKILL.md`],
    ["a skill file with no resolvable directory", "cat SKILL.md"],
    ["a tail from line 1", `tail -n +1 ${cachePath}/SKILL.md`],
    ["a diff against an empty file", `diff /dev/null ${cachePath}/SKILL.md`],
    ["a sed script without -n", `sed 's/a/b/' ${cachePath}/SKILL.md`],
    ["a sed range with combined flags", `sed -ne '200,250p' ${cachePath}/SKILL.md`],
    ["a git show", `git show HEAD:plugins/demo/skills/auto-skill/SKILL.md`],
    ["a find that runs a command", `find ${cachePath} -name SKILL.md -exec cat {} +`],
    ["a path inside a script", `python3 -c "print(open('${cachePath}/SKILL.md').read())"`],
    ["a path held in a variable", `f=${cachePath}/SKILL.md; cat "$f"`],
    ["a path in an assignment prefix", `F=${cachePath}/SKILL.md cat README.md`],
    ["a git diff of an untracked file", `git diff --no-index /dev/null ${cachePath}/SKILL.md`],
    ["a git log with patches", "git log -p -- .agents/skills/local-skill/SKILL.md"],
    [
      "a git show of a committed repo-local skill",
      "git show HEAD:.agents/skills/local-skill/SKILL.md",
    ],
    ["a listing piped to xargs", `ls ${cachePath}/SKILL.md | xargs cat`],
    ["an unquoted command substitution", `cat $(ls ${cachePath}/SKILL.md)`],
    ["a command substitution in an assignment", `body=$(cat ${cachePath}/SKILL.md); echo ok`],
    [
      "a relative path in a command substitution",
      'echo "$(cat .agents/skills/local-skill/SKILL.md)"',
    ],
    [
      "a relative path in a script",
      `python3 -c "print(open('.agents/skills/local-skill/SKILL.md').read())"`,
    ],
    ["a find piped to xargs", "find .agents/skills -name SKILL.md -print0 | xargs -0 cat"],
    [
      "a listing piped to a read loop",
      `ls ${cachePath}/SKILL.md | while read f; do cat "$f"; done`,
    ],
    ["a command substitution", `echo "$(cat ${cachePath}/SKILL.md)"`],
    ["a whole file piped to a pager", `cat ${cachePath}/SKILL.md | less`],
    ["a glob over skill files", "cat .agents/skills/*/SKILL.md"],
    // A load whose output never reaches the agent, or reaches it later through a copy.
    ["a cat to /dev/null", `cat ${cachePath}/SKILL.md >/dev/null`],
    ["a cat to a file through fd 1", `cat ${cachePath}/SKILL.md 1> copy.md`],
    ["a cat appended to a file", `cat ${cachePath}/SKILL.md >> copy.md`],
    ["a cat to a clobbered file", `cat ${cachePath}/SKILL.md >| copy.md`],
    ["a cat with both streams to a file", `cat ${cachePath}/SKILL.md &> copy.md`],
    ["a cat with both streams to a file via >&", `cat ${cachePath}/SKILL.md >& copy.md`],
    ["a filtered load to /dev/null", `nl -ba ${cachePath}/SKILL.md | sed -n '1,9p' >/dev/null`],
    ["a head of zero lines", `head -n 0 ${cachePath}/SKILL.md`],
    ["a head of zero attached lines", `head -n0 ${cachePath}/SKILL.md`],
    ["a head of zero bytes", `head -c 0 ${cachePath}/SKILL.md`],
    ["a head of zero long-form lines", `head --lines=0 ${cachePath}/SKILL.md`],
    ["a load piped to a head of zero lines", `cat ${cachePath}/SKILL.md | head -n 0`],
    // A path the shell composes from a variable, a glob, or a brace expansion.
    ["a skill file under a variable directory", `d=${cachePath}; cat "$d/SKILL.md"`],
    ["a skill file under a braced variable", `d=${cachePath}; cat "\${d}/SKILL.md"`],
    ["a skill file after a cd into a variable", `d=${cachePath}; cd "$d" && cat SKILL.md`],
    ["a glob over a staged skill directory", `cat ${cachePath}/*`],
    ["a brace expansion over skill names", "cat .agents/skills/{local-skill,other}/SKILL.md"],
    // Text the shell does not run, unless the heredoc feeds a shell.
    ["a skill path in a heredoc body", `cat <<'EOF'\ncat ${cachePath}/SKILL.md\nEOF`],
    [
      "a skill path in a tab-stripped heredoc body",
      `cat <<-EOF > notes.md\n\tcat ${cachePath}/SKILL.md\n\tEOF\necho done`,
    ],
    ["a skill path in a multi-line string", `echo "notes\ncat ${cachePath}/SKILL.md\n"`],
    ["a skill path in a herestring", `cat <<< ${cachePath}/SKILL.md`],
    ["a load after a heredoc", `cat <<'EOF' > /dev/null\nnotes\nEOF\ncat ${cachePath}/SKILL.md`],
    // A search flag outside the tool's list can print the body around the matches.
    ["an inverted search", `grep -v zzz ${cachePath}/SKILL.md`],
    ["a passthrough search after a value flag", `rg -g -l --passthru name ${cachePath}/SKILL.md`],
    // Forms whose control flow the classifier does not read.
    ["a load after ||", `true || cat ${cachePath}/SKILL.md`],
    ["a load in the background", `cat ${cachePath}/SKILL.md & wait`],
    ["a load after a cd in a subshell", `(cd ${cachePath}); cat SKILL.md`],
    ["a load after a cd joined by ;", `cd ${cachePath}; cat SKILL.md`],
    ["a load in a backtick substitution", "echo `cat .agents/skills/local-skill/SKILL.md`"],
    ["a load in an if", `if true; then cat ${cachePath}/SKILL.md; fi`],
    // A recursive read rooted at a directory that holds a staged skill file.
    [
      "a find that runs cat under a plugin root",
      "find /deploy/plugins/demo -type f -exec cat {} +",
    ],
    // Load commands whose flags print something other than the body from line 1.
    ["a cat help", `cat --help ${cachePath}/SKILL.md`],
    ["a cat version", `cat --version ${cachePath}/SKILL.md`],
    ["a numbered help", `nl --help ${cachePath}/SKILL.md`],
    ["a head of a suffixed zero count", `head -n 0K ${cachePath}/SKILL.md`],
    ["a head of all but the last lines", `head -n -100000 ${cachePath}/SKILL.md`],
    ["a load after an exit", `exit 0; cat ${cachePath}/SKILL.md`],
    [
      "a load after an exec with an assignment prefix",
      `FOO=1 exec true; cat ${cachePath}/SKILL.md`,
    ],
    ["a load after a builtin exit", `builtin exit 0; cat ${cachePath}/SKILL.md`],
    // A filter that names its own file prints that file instead of, or before, the piped body.
    ["a load piped to a filter of another file", `cat ${cachePath}/SKILL.md | nl README.md`],
    [
      "a load piped behind another file",
      `cat ${cachePath}/SKILL.md | cat README.md - | head -n 40`,
    ],
    [
      "ANSI-C quoting before a heredoc",
      "echo $'it\\'s' && cat <<EOF\nsee .agents/skills/local-skill/SKILL.md\nEOF",
    ],
    // Several files reach a range as one stream, so the range cannot be tied to one file.
    [
      "a sed range over two skill files",
      `sed -n '1,200p' ${cachePath}/SKILL.md /deploy/plugins/demo/skills/auto-skill-extra/SKILL.md`,
    ],
    ["a sed range from line 1 of another file", `sed -n '1,40p' README.md ${cachePath}/SKILL.md`],
    ["a late sed range over another file", `sed -n '300,400p' README.md ${cachePath}/SKILL.md`],
    ["two files piped to a head", `cat README.md ${cachePath}/SKILL.md | head -n 40`],
    // Paths the shell composes from a cd into a skills directory or a bracket glob.
    ["a glob after a cd into a skills directory", "cd .agents/skills && cat local-skill/SKILL*"],
    [
      "a relative glob after a cd into a plugin's skills directory",
      "cd /run/plugins/cache/trigger-eval/demo/1.0.0/skills && cat */*.md",
    ],
    ["a bracket glob over a skill file name", "cat .agents/skills/local-skill/[S]KILL.md"],
    ["a bracket glob over a file extension", `cat ${cachePath}/SKILL.m[d]`],
    // A spaced number before `>` is an argument, and the redirect takes standard output.
    ["a head of two lines to a file", `cat ${cachePath}/SKILL.md | head -n 2 > /tmp/x`],
    ["a cat with a spaced 2 before a redirect", `cat ${cachePath}/SKILL.md 2 > /tmp/x`],
    // git forms that print a body as patch lines.
    [
      "a git log with patch and stat",
      "git log --patch-with-stat -- .agents/skills/local-skill/SKILL.md",
    ],
    ["a git log with context lines", "git log -U3 -- .agents/skills/local-skill/SKILL.md"],
    [
      "a git diff between revisions",
      "git diff 4b825dc642cb6eb9a060e54bf8d69288fbb7d904 HEAD -- .agents/skills/local-skill/SKILL.md",
    ],
  ])("reports %s as unclassified access", (_form, command) => {
    const observed = observe(commandExecutionEvent(command));

    expect(observed.signal).toBe("none");
    expect(observed.unclassifiedSkillAccess).toBeDefined();
    expect(observed.unclassifiedSkillAccess).toMatch(/SKILL|skills|plugins|\.agents/);
  });

  // A context search prints the lines around each match, which can include line 1. It inspects only
  // as the command's only segment, when its output shows it never printed line 1.
  it.each([
    // Recorded 2026-10-07 on codex-cli 0.160.1, gpt-6.1-sol (optimize-trigger conceptual-question
    // attempt 2): two searches of a repo-local skill to answer a question about it. Each output is
    // abridged to its first, match, and last lines.
    {
      name: "the recorded excerpt of a later section",
      command: `/opt/homebrew/bin/zsh -lc "rg -n -A 50 -B 12 'On Claude Code, the runner' .agents/skills/local-skill/SKILL.md"`,
      outcome: {
        exitCode: 0,
        output: "274-  change.\n286:- On Claude Code, the runner\n323-  stops\n",
      },
      unclassified: false,
    },
    {
      name: "the recorded excerpt of another later section",
      command: `/opt/homebrew/bin/zsh -lc "rg -n -A 17 -B 3 'decision-item' .agents/skills/local-skill/SKILL.md"`,
      outcome: {
        exitCode: 0,
        output: "297-- Attempt\n300:- the decision-item budget\n317-  timeout\n",
      },
      unclassified: false,
    },
    // Not recorded: rg prints `--` between context groups that do not touch.
    {
      name: "an excerpt with two context groups",
      command: `rg -n -A 1 -B 1 'decision-item' ${cachePath}/SKILL.md`,
      outcome: {
        exitCode: 0,
        output: "299-a\n300:decision-item\n301-b\n--\n340-c\n341:decision-item\n342-d\n",
      },
      unclassified: false,
    },
    {
      name: "an excerpt that includes line 1",
      command: `rg -n -B 5 'name:' ${cachePath}/SKILL.md`,
      outcome: { exitCode: 0, output: "1----\n2:name: auto-skill\n" },
      unclassified: true,
    },
    {
      name: "an excerpt without line numbers",
      command: `rg -C 400 name ${cachePath}/SKILL.md`,
      outcome: { exitCode: 0, output: "---\nname: auto-skill\n---\n" },
      unclassified: true,
    },
    {
      name: "an excerpt with no output",
      command: `rg -n -A 3 zzz ${cachePath}/SKILL.md`,
      outcome: { exitCode: 1, output: "" },
      unclassified: true,
    },
    // Output the search did not number itself: a preceding command's output without a final line
    // break runs into the first line, and piped text already carries numbers.
    {
      name: "an excerpt after another command",
      command: `printf 5; rg -n -B 1 name ${cachePath}/SKILL.md`,
      outcome: { exitCode: 0, output: "51----\n2:name: auto-skill\n" },
      unclassified: true,
    },
    {
      name: "an excerpt of piped text",
      command: `nl -ba -v2 -s: -w1 ${cachePath}/SKILL.md | rg -B 1 -A 400 name`,
      outcome: { exitCode: 0, output: "2:---\n3:name: auto-skill\n" },
      unclassified: true,
    },
  ])("decides a context search from $name", ({ command, outcome, unclassified }) => {
    const observed = observe(commandExecutionEvent(command, outcome));

    expect(observed.invokedSkills).toStrictEqual([]);
    expect(observed.unclassifiedSkillAccess !== undefined).toBe(unclassified);
  });

  // The trigger decision is the first command that loads a staged skill. Recorded 2026-10-04 on
  // gpt-6.1-sol (optimize-trigger not-triggering-report): after loading the target, Codex read the
  // skill it was asked to tune as data.
  const extraPath = "/deploy/plugins/demo/skills/auto-skill-extra/SKILL.md";
  const readExtra = commandExecutionEvent(`cat ${extraPath}`);
  const readTarget = commandExecutionEvent(`cat ${cachePath}/SKILL.md`);
  const unclassifiedRead = commandExecutionEvent(`awk 'NR < 50' ${extraPath}`);
  it.each([
    { name: "a load in a later command", commands: [readTarget, readExtra], unclassified: false },
    {
      name: "an unclassified access in a later command",
      commands: [readTarget, unclassifiedRead],
      unclassified: false,
    },
    {
      name: "an unclassified access before the load",
      commands: [unclassifiedRead, readTarget],
      unclassified: true,
    },
    {
      name: "an unclassified access inside the loading command",
      commands: [commandExecutionEvent(`cat ${cachePath}/SKILL.md; awk 'NR < 50' ${extraPath}`)],
      unclassified: true,
    },
    // A command that names a staged skill file without loading it leaves the decision open.
    {
      name: "a content search of a skill file before the load",
      commands: [commandExecutionEvent(`rg -n 'name' ${extraPath}`), readTarget],
      unclassified: false,
    },
    {
      name: "a failed read before the load",
      commands: [
        commandExecutionEvent(`cat ${extraPath}`, {
          status: "failed",
          exitCode: 1,
          output: `cat: ${extraPath}: No such file or directory\n`,
        }),
        readTarget,
      ],
      unclassified: false,
    },
  ])(
    "decides the trigger decision from the first loading command given $name",
    ({ commands, unclassified }) => {
      const observed = observe(commands.join("\n"));

      expect(observed.invokedSkills).toStrictEqual(["demo:auto-skill"]);
      expect(observed.unclassifiedSkillAccess !== undefined).toBe(unclassified);
    },
  );

  it("stops the run at the first load, without waiting for an assistant message", () => {
    expect(shouldStopEarly(observe(readExtra), CODEX_SKIP_DECISION_ITEM_BUDGET)).toBe(true);
  });

  // A command's exit status covers its last segment, so the output decides whether a read in a
  // failed command ran, and only output that can be tied to the load segment counts: the body at
  // the start of the output of a leading load proves the load, and a file error on the staged path
  // with no body anywhere proves a failed read.
  const missingFile = `cat: ${cachePath}/SKILL.md: No such file or directory\n`;
  const body = "---\nname: auto-skill\n---\n";
  it.each([
    {
      name: "a failed command whose leading load's body starts the output",
      command: `cd /tmp && cat ${cachePath}/SKILL.md && rg --files -g 'AGENTS.md'`,
      outcome: { status: "failed", exitCode: 1, output: body },
      loaded: true,
      unclassified: false,
    },
    {
      name: "a failed command whose leading load's body starts the output numbered by nl",
      command: `nl -ba ${cachePath}/SKILL.md; false`,
      outcome: { status: "failed", exitCode: 1, output: "     1\t---\n     2\tname: auto-skill\n" },
      loaded: true,
      unclassified: false,
    },
    {
      name: "a failed command whose name line comes from an inspection before a skipped load",
      command: `sed -n '2p' ${cachePath}/SKILL.md && false && cat ${cachePath}/SKILL.md`,
      outcome: { status: "failed", exitCode: 1, output: "name: auto-skill\n" },
      loaded: false,
      unclassified: true,
    },
    {
      name: "a failed command whose body follows another segment's output",
      command: `pwd && cat ${cachePath}/SKILL.md && false`,
      outcome: { status: "failed", exitCode: 1, output: `/work\n${body}` },
      loaded: false,
      unclassified: true,
    },
    {
      name: "a failed command whose body follows a file error on another staged path",
      command: `cat ${cachePath.replace("1.0.0", "9.9.9")}/SKILL.md; cat ${cachePath}/SKILL.md; false`,
      outcome: {
        status: "failed",
        exitCode: 1,
        output: `${missingFile.replace("1.0.0", "9.9.9")}${body}`,
      },
      loaded: true,
      unclassified: false,
    },
    {
      // Recorded 2026-10-04 on gpt-6.1-sol (add-skill repo-local-skill-request, attempt 2): the
      // workspace had no AGENTS.md, so cat printed its error, then the body, and exited 1.
      name: "a failed cat whose body follows a missing earlier operand",
      command: `cat AGENTS.md ${cachePath}/SKILL.md`,
      outcome: {
        status: "failed",
        exitCode: 1,
        output: `cat: AGENTS.md: No such file or directory\n${body}`,
      },
      loaded: true,
      unclassified: false,
    },
    {
      name: "a failed command whose output shows a file error on the staged path",
      command: `cat ${cachePath}/SKILL.md`,
      outcome: { status: "failed", exitCode: 1, output: missingFile },
      loaded: false,
      unclassified: false,
    },
    {
      // Recorded 2026-09-24 on gpt-6-sol: rg matched nothing and exited 1, so the cat may never
      // have run, and nothing in the output says whether it did.
      name: "a failed command whose output shows neither",
      command: `rg --files -g 'AGENTS.md' && cat ${cachePath}/SKILL.md`,
      outcome: { status: "failed", exitCode: 1, output: "" },
      loaded: false,
      unclassified: true,
    },
    {
      name: "a successful command whose output shows a file error on the staged path",
      command: `cat ${cachePath}/SKILL.md; echo done`,
      outcome: { status: "completed", exitCode: 0, output: `${missingFile}done\n` },
      loaded: false,
      unclassified: false,
    },
    {
      // Codex can drop the head of a long output, so a successful read stays credited without it.
      name: "a successful command whose output shows neither",
      command: `cat ${cachePath}/SKILL.md`,
      outcome: { status: "completed", exitCode: 0, output: "…\n## Rules\n" },
      loaded: true,
      unclassified: false,
    },
    {
      name: "a successful command whose file error names a longer path",
      command: `cat ${cachePath}/SKILL.md; ls ${cachePath}/SKILL.md.bak; true`,
      outcome: {
        status: "completed",
        exitCode: 0,
        output: `…\n## Rules\nls: ${cachePath}/SKILL.md.bak: No such file or directory\n`,
      },
      loaded: true,
      unclassified: false,
    },
    // An exit status of 0 proves only that the command's last list succeeded, and a form outside
    // the accepted shapes is unclassified whole.
    ...(
      [
        ["a load that starts an || list", `cat ${cachePath}/SKILL.md || true`],
        ["a load in an earlier && list", `false && cat ${cachePath}/SKILL.md; true`],
        [
          "a load in an || list",
          `test -f ${cachePath}/SKILL.md && cat ${cachePath}/SKILL.md || echo none`,
        ],
        ["a load in an untaken branch", `if false; then cat ${cachePath}/SKILL.md; fi`],
        ["a load in a loop body", `for x in; do cat ${cachePath}/SKILL.md; done`],
        ["a load in a group after ||", `true || (cat ${cachePath}/SKILL.md; true)`],
        ["a load in a group after &&", `cd /tmp && (cat ${cachePath}/SKILL.md)`],
        ["a load in an uncalled function", `f() { cat ${cachePath}/SKILL.md; }; true`],
        [
          "a load in an uncalled keyword function",
          `function f { cat ${cachePath}/SKILL.md; }; true`,
        ],
      ] as const
    ).map(([form, command]) => ({
      name: `a successful command with ${form}`,
      command,
      outcome: { status: "completed", exitCode: 0, output: "" },
      loaded: false,
      unclassified: true,
    })),
    ...(
      [
        // Recorded 2026-09-07 on gpt-6-sol: the whole && list ran, or the command would have failed.
        [
          "a load at the end of an && list",
          `pwd && rg --files -g 'AGENTS.md' && sed -n '1,240p' ${cachePath}/SKILL.md`,
        ],
        ["a load after a ;", `false; cat ${cachePath}/SKILL.md`],
      ] as const
    ).map(([form, command]) => ({
      name: `a successful command with ${form}`,
      command,
      outcome: { status: "completed", exitCode: 0, output: "…\n## Rules\n" },
      loaded: true,
      unclassified: false,
    })),
  ])("decides a skill read from $name", ({ command, outcome, loaded, unclassified }) => {
    const observed = observe(commandExecutionEvent(command, outcome));

    expect(observed.invokedSkills).toStrictEqual(loaded ? ["demo:auto-skill"] : []);
    expect(observed.unclassifiedSkillAccess !== undefined).toBe(unclassified);
    expect(observed.decisionItemCount).toBe(1);
  });

  it("ties a failed command's leading body to its leading load, not a same-named skill", () => {
    const otherPath = "/deploy/plugins/other/skills/auto-skill/SKILL.md";
    const observed = observeCodexOutput(
      {
        stdout: commandExecutionEvent(`cat ${otherPath} && false && cat ${cachePath}/SKILL.md`, {
          status: "failed",
          exitCode: 1,
          output: body,
        }),
        stderr: "",
      },
      [
        ...invocableSkills,
        { skillLabel: "other:auto-skill", pluginName: "other", skillName: "auto-skill" },
      ],
    );

    expect(observed.invokedSkills).toStrictEqual(["other:auto-skill"]);
    expect(observed.unclassifiedSkillAccess).toContain(`${cachePath}/SKILL.md`);
  });

  it("ignores skill names in assistant messages", () => {
    const observed = observe(agentMessageEvent("I'll use demo:auto-skill for this."));

    expect(observed.signal).toBe("none");
    expect(observed.decisionItemCount).toBe(1);
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
