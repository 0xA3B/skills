import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { caseAttemptKey, type TriggerCase } from "../../src/trigger-evals/fixtures/index.js";
import {
  type AgentLane,
  type CaseExecuteOptions,
  type CaseObservations,
  type CliRunResult,
  DEFAULT_EVAL_MODELS,
  type LaneRunOptions,
  type StreamingCliOutput,
} from "../../src/trigger-evals/lanes/index.js";
import { runTriggerEval } from "../../src/trigger-evals/runner.js";
import {
  buildCliRunResult,
  exists,
  writeRepoFixture,
  writeRepoLocalSkillFixture,
} from "./test-utils.js";

type FakeLaneOptions = {
  observationsFor?: (
    testCase: TriggerCase,
    output: StreamingCliOutput,
    attempt: number,
  ) => CaseObservations;
  executeResult?: (testCase: TriggerCase) => Promise<CliRunResult>;
  // Runtime directories the fake lane creates and tracks, mirroring a real lane's staged
  // workspace root (run scope) and per-attempt Codex home (attempt scope).
  runtimeRoot?: string;
  prepareRunError?: Error;
  prepareCaseError?: (testCase: TriggerCase) => Error | undefined;
  // Hold a case's execute until the named sibling case's runtime directory for the same attempt has
  // been released, so a test can observe what a sibling's release did to a case still running.
  holdUntilReleased?: (testCase: TriggerCase) => string | undefined;
  skillDependencies?: ReadonlyMap<string, ReadonlySet<string>>;
  // The agent CLI version the lane reports for the whole run, as the Codex lane does.
  agentVersion?: string;
};

type FakeLaneState = {
  runOptions: LaneRunOptions | undefined;
  preparedCaseIds: string[];
  executed: Array<{ testCase: TriggerCase; executeOptions: CaseExecuteOptions }>;
  caseCleanups: number;
  runCleanups: number;
  activeExecs: number;
  maxActiveExecs: number;
  runtimeDir: string | undefined;
  // Keyed by attempt key, as are the two maps below.
  caseRuntimeDirs: Map<string, string>;
  // Which attempt runtime directories still existed when each attempt executed.
  liveCaseDirsAtExecute: Map<string, string[]>;
  // Which attempt runtime directories, and whether the run directory, still existed when each
  // attempt's execute ended.
  runtimeLiveAtExecuteEnd: Map<string, { caseDirs: string[]; runDir: boolean }>;
};

// Throws at the deadline so a release that never comes fails the test instead of passing late.
async function waitUntilGone(dirPath: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (await exists(dirPath)) {
    if (Date.now() >= deadline) {
      throw new Error(`${dirPath} was not released within 2000ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// A skip-decision budget other than the verdict default, so a runner that drops the lane's budget
// is caught.
const FAKE_SKIP_DECISION_ITEM_BUDGET = 8;

// Orchestration tests exercise the runner through the lane seam with a fake adapter; real lane
// behavior is covered by the lane and staging tests.
function createFakeLane(options: FakeLaneOptions = {}): { lane: AgentLane; state: FakeLaneState } {
  const state: FakeLaneState = {
    runOptions: undefined,
    preparedCaseIds: [],
    executed: [],
    caseCleanups: 0,
    runCleanups: 0,
    activeExecs: 0,
    maxActiveExecs: 0,
    runtimeDir: undefined,
    caseRuntimeDirs: new Map(),
    liveCaseDirsAtExecute: new Map(),
    runtimeLiveAtExecuteEnd: new Map(),
  };
  const defaultObservations = (testCase: TriggerCase): CaseObservations =>
    testCase.expect === "invoke"
      ? {
          signal: "stdout-skill-canary",
          invokedSkills: ["demo:auto-skill"],
          hasActivity: true,
          decisionItemCount: 1,
        }
      : { signal: "none", invokedSkills: [], hasActivity: true, decisionItemCount: 1 };
  const liveCaseDirs = async (): Promise<string[]> => {
    const live: string[] = [];
    for (const [key, caseRuntimeDir] of state.caseRuntimeDirs) {
      if (await exists(caseRuntimeDir)) {
        live.push(key);
      }
    }
    return live;
  };

  const lane: AgentLane = {
    async prepareRun(runOptions) {
      state.runOptions = runOptions;
      if (options.runtimeRoot !== undefined) {
        state.runtimeDir = path.join(options.runtimeRoot, "run-parent", "run");
        await mkdir(state.runtimeDir, { recursive: true });
        runOptions.runtime.track(state.runtimeDir);
      }
      if (options.prepareRunError !== undefined) {
        throw options.prepareRunError;
      }
      return {
        stagedSkillLabels: new Set(["demo:auto-skill"]),
        skillDependencies: options.skillDependencies ?? new Map(),
        skipDecisionItemBudget: FAKE_SKIP_DECISION_ITEM_BUDGET,
        ...(options.agentVersion === undefined ? {} : { agentVersion: options.agentVersion }),
        async prepareCase(testCase, attempt) {
          state.preparedCaseIds.push(testCase.id);
          const key = caseAttemptKey(testCase.id, attempt);
          if (options.runtimeRoot !== undefined) {
            const caseRuntimeDir = path.join(options.runtimeRoot, "cases", key);
            await mkdir(caseRuntimeDir, { recursive: true });
            state.caseRuntimeDirs.set(key, caseRuntimeDir);
            runOptions.runtime.track(caseRuntimeDir, key);
          }
          const prepareError = options.prepareCaseError?.(testCase);
          if (prepareError !== undefined) {
            throw prepareError;
          }
          return {
            workspacePath: `/fake/${testCase.id}`,
            observe: (output) =>
              options.observationsFor?.(testCase, output, attempt) ?? defaultObservations(testCase),
            async execute(executeOptions) {
              state.executed.push({ testCase, executeOptions });
              state.activeExecs += 1;
              state.maxActiveExecs = Math.max(state.maxActiveExecs, state.activeExecs);
              state.liveCaseDirsAtExecute.set(key, await liveCaseDirs());
              // Evidence a real lane writes under the case directory, which cleanup must keep.
              await mkdir(executeOptions.caseDir, { recursive: true });
              await writeFile(path.join(executeOptions.caseDir, "events.jsonl"), "{}\n");
              try {
                if (options.executeResult !== undefined) {
                  return await options.executeResult(testCase);
                }
                const sibling = options.holdUntilReleased?.(testCase);
                const siblingDir =
                  sibling === undefined
                    ? undefined
                    : state.caseRuntimeDirs.get(caseAttemptKey(sibling, attempt));
                if (siblingDir !== undefined) {
                  await waitUntilGone(siblingDir);
                }
                return buildCliRunResult();
              } finally {
                state.activeExecs -= 1;
                state.runtimeLiveAtExecuteEnd.set(key, {
                  caseDirs: await liveCaseDirs(),
                  runDir: await exists(state.runtimeDir ?? ""),
                });
              }
            },
            cleanup: async () => {
              state.caseCleanups += 1;
            },
          };
        },
        cleanup: async () => {
          state.runCleanups += 1;
        },
      };
    },
  };

  return { lane, state };
}

// The attempt key of a case's only attempt in a run without --repeat.
function onlyAttempt(caseId: string): string {
  return caseAttemptKey(caseId, 1);
}

describe("runTriggerEval", () => {
  it("runs cases concurrently, preserves fixture order, and writes the report", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
        { id: "case-c", expect: "invoke" },
        { id: "case-d", expect: "skip" },
      ],
    });
    const { lane, state } = createFakeLane();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      concurrency: 2,
      lane,
    });

    expect(result.results.map((caseResult) => caseResult.caseId)).toStrictEqual([
      "case-a",
      "case-b",
      "case-c",
      "case-d",
    ]);
    expect(result.results.every((caseResult) => caseResult.passed)).toBe(true);
    expect(result.results[0]).toMatchObject({
      invoked: true,
      invocationSignal: "stdout-skill-canary",
    });
    expect(state.maxActiveExecs).toBe(2);
    expect(state.caseCleanups).toBe(4);
    expect(state.runCleanups).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(
      Math.max(...result.results.map((caseResult) => caseResult.durationMs)),
    );
    // Case artifacts land under the run directory, one directory per attempt of each case; the
    // run directory names the skill and agent so codex and claude artifacts stay distinguishable.
    expect(state.executed[0]?.executeOptions.caseDir).toBe(
      path.join(result.runDir, "cases", "case-a", "attempt-1"),
    );
    expect(result.runDir).toContain("auto_skill-codex-");
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      results: unknown[];
    };
    expect(report.results).toHaveLength(4);
  });

  it("runs only the requested case ids", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
        { id: "case-c", expect: "skip" },
      ],
    });
    const { lane, state } = createFakeLane();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["case-c", "case-a"],
      lane,
    });

    expect(result.results.map((caseResult) => caseResult.caseId)).toStrictEqual([
      "case-a",
      "case-c",
    ]);
    expect(state.preparedCaseIds).toStrictEqual(["case-a", "case-c"]);
  });

  it("runs every case once per attempt and records each attempt in fixture order", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
      ],
    });
    // case-a's second attempt misses the invocation, so only that attempt fails.
    const { lane } = createFakeLane({
      observationsFor: (testCase, _output, attempt) =>
        testCase.id === "case-a" && attempt !== 2
          ? {
              signal: "stdout-skill-canary",
              invokedSkills: ["demo:auto-skill"],
              hasActivity: true,
              decisionItemCount: 1,
            }
          : { signal: "none", invokedSkills: [], hasActivity: true, decisionItemCount: 1 },
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      repeat: 3,
      lane,
    });

    expect(
      result.results.map(({ caseId, attempt, passed }) => ({ caseId, attempt, passed })),
    ).toStrictEqual([
      { caseId: "case-a", attempt: 1, passed: true },
      { caseId: "case-a", attempt: 2, passed: false },
      { caseId: "case-a", attempt: 3, passed: true },
      { caseId: "case-b", attempt: 1, passed: true },
      { caseId: "case-b", attempt: 2, passed: true },
      { caseId: "case-b", attempt: 3, passed: true },
    ]);
    // The failing attempt keeps its own evidence beside its siblings'.
    await expect(
      stat(path.join(result.runDir, "cases", "case-a", "attempt-2", "events.jsonl")),
    ).resolves.toBeDefined();
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      results: Array<{ caseId: string; attempt: number }>;
    };
    expect(report.results.map(({ caseId, attempt }) => `${caseId}#${attempt}`)).toStrictEqual([
      "case-a#1",
      "case-a#2",
      "case-a#3",
      "case-b#1",
      "case-b#2",
      "case-b#3",
    ]);
  });

  it("releases each attempt's runtime state on its own", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({ runtimeRoot });

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["invoke-case"],
      repeat: 2,
      concurrency: 1,
      lane,
    });

    // Sequential attempts: the first attempt's state is gone before the second executes.
    const second = caseAttemptKey("invoke-case", 2);
    expect(state.liveCaseDirsAtExecute.get(second)).toStrictEqual([second]);
    expect(await exists(state.caseRuntimeDirs.get(second) ?? "")).toBe(false);
  });

  it.each([0, -1, 1.5])("rejects a repeat count of %s", async (repeat) => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane();

    await expect(
      runTriggerEval({ repoRoot, skillPath: "plugins/demo/skills/auto-skill", repeat, lane }),
    ).rejects.toThrow("repeat must be a positive integer.");
    expect(state.preparedCaseIds).toStrictEqual([]);
  });

  it("records the checkout, requested model, agent version, and resolved model in the report", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    // Claude reports its version and resolved model in each case's own event stream.
    const { lane } = createFakeLane({
      observationsFor: () => ({
        signal: "none",
        invokedSkills: [],
        hasActivity: true,
        decisionItemCount: 1,
        agentVersion: "Claude Code 2.1.286",
        resolvedModel: "claude-opus-5-5",
      }),
    });
    const checkout = { root: repoRoot, branch: "main", head: "abc1234", uncommittedFiles: 2 };

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      agent: "claude",
      caseIds: ["skip-case"],
      checkout,
      lane,
    });

    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as Record<string, unknown>;
    expect(report).toMatchObject({
      checkout,
      model: "opus",
      effort: "medium",
      agentVersion: "Claude Code 2.1.286",
      resolvedModel: "claude-opus-5-5",
      results: [
        {
          caseId: "skip-case",
          resolvedModel: "claude-opus-5-5",
          agentVersion: "Claude Code 2.1.286",
        },
      ],
    });
  });

  it("records the agent version a lane reports for the whole run", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane } = createFakeLane({ agentVersion: "codex-cli 0.159.3" });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane,
    });

    expect(result).toMatchObject({ model: "gpt-6-sol", agentVersion: "codex-cli 0.159.3" });
    expect(result.resolvedModel).toBeUndefined();
  });

  it("resolves per-agent default models before handing the run to the lane", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const codex = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane: codex.lane,
    });
    expect(codex.state.runOptions).toMatchObject({
      model: DEFAULT_EVAL_MODELS.codex,
      effort: "medium",
    });

    const claude = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      agent: "claude",
      caseIds: ["skip-case"],
      lane: claude.lane,
    });
    expect(claude.state.runOptions).toMatchObject({
      model: DEFAULT_EVAL_MODELS.claude,
      effort: "medium",
    });
  });

  it("hands an explicit model, effort, timeout, and abort signal to the lane", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane();
    const abortController = new AbortController();

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      model: "custom-model",
      effort: "high",
      timeoutMs: 1_234,
      abortSignal: abortController.signal,
      lane,
    });

    expect(state.runOptions).toMatchObject({ model: "custom-model", effort: "high" });
    expect(state.executed[0]?.executeOptions).toMatchObject({
      timeoutMs: 1_234,
      abortSignal: abortController.signal,
    });
  });

  it("wires lane observations into the early-stop condition", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane({
      observationsFor: (_testCase, output) => ({
        signal: output.stdout.includes("CANARY") ? "stdout-skill-canary" : "none",
        invokedSkills: output.stdout.includes("CANARY") ? ["demo:auto-skill"] : [],
        hasActivity: true,
        decisionItemCount: output.stdout.split("ITEM").length - 1,
      }),
    });

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane,
    });

    const stopWhen = state.executed[0]?.executeOptions.stopWhen;
    expect(stopWhen).toBeDefined();
    // The lane's own skip-decision budget bounds the run, not the verdict default.
    expect(
      stopWhen?.({ stdout: "ITEM".repeat(FAKE_SKIP_DECISION_ITEM_BUDGET - 1), stderr: "" }),
    ).toBe(false);
    expect(stopWhen?.({ stdout: "ITEM".repeat(FAKE_SKIP_DECISION_ITEM_BUDGET), stderr: "" })).toBe(
      true,
    );
    expect(stopWhen?.({ stdout: "CANARY", stderr: "" })).toBe(true);
  });

  it("classifies case results from lane observations and run results", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane } = createFakeLane({
      executeResult: async () =>
        buildCliRunResult({ exitCode: 1, error: "codex exec exited with code 1." }),
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane,
    });

    // The expectation matched, so the CLI error is recorded without failing the case.
    expect(result.results[0]).toMatchObject({
      caseId: "skip-case",
      expect: "skip",
      invoked: false,
      passed: true,
      error: "codex exec exited with code 1.",
    });
  });

  it("attributes a skill the target's body names to the target's workflow", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane } = createFakeLane({
      skillDependencies: new Map([["demo:auto-skill", new Set(["demo:helper-skill"])]]),
      observationsFor: () => ({
        signal: "command-skill-read",
        invokedSkills: ["demo:helper-skill", "demo:auto-skill"],
        hasActivity: true,
        decisionItemCount: 1,
      }),
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["invoke-case"],
      lane,
    });

    expect(result.results[0]).toMatchObject({
      invoked: true,
      dependencyLoads: ["demo:helper-skill"],
      passed: true,
    });
  });

  it("skips manual-only skills without preparing the lane", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    await writeFile(
      path.join(repoRoot, ".agents", "skills", "auto-skill", "agents", "openai.yaml"),
      "version: 1\npolicy:\n  allow_implicit_invocation: false\n",
    );
    const { lane, state } = createFakeLane();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: ".agents/skills/auto-skill",
      lane,
    });

    expect(result.skippedReason).toContain("manual-only");
    expect(result.results).toStrictEqual([]);
    expect(state.runOptions).toBeUndefined();
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      skippedReason?: string;
    };
    expect(report.skippedReason).toContain("manual-only");
  });

  it("hands the marketplace catalog's plugins to the lane by default", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane();

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane,
    });

    expect(state.runOptions?.extraPlugins?.map((entry) => entry.pluginName)).toStrictEqual([
      "demo",
      "other",
    ]);
    // Repo-local skills never stage for plugin targets: they do not exist where plugins install.
    expect(state.runOptions?.extraRepoLocalSkills).toBeUndefined();
  });

  it("stages marketplace plugins and repo-local siblings for repo-local targets by default", async () => {
    const repoRoot = await writeRepoLocalSkillFixture({
      marketplace: true,
      siblingSkills: [{ name: "sibling-skill" }],
    });
    const { lane, state } = createFakeLane();

    await runTriggerEval({
      repoRoot,
      skillPath: ".agents/skills/auto-skill",
      caseIds: ["skip-case"],
      lane,
    });

    expect(state.runOptions?.extraPlugins?.map((entry) => entry.pluginName)).toStrictEqual([
      "other",
    ]);
    // The target is excluded from the sibling list; lanes stage it themselves.
    expect(state.runOptions?.extraRepoLocalSkills?.map((skill) => skill.skillName)).toStrictEqual([
      "sibling-skill",
    ]);
  });

  it("fails loudly when default staging finds no marketplace catalog", async () => {
    const repoRoot = await writeRepoFixture();
    const { lane } = createFakeLane();

    // Default staging hard-requires the agent's catalog: a missing catalog is a repository
    // misconfiguration surfaced as an error, never silently degraded to isolated staging.
    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      }),
    ).rejects.toThrow("Unable to read the codex marketplace catalog");
  });

  it("cleans up, releases runtime state, and rethrows the original error when execution fails", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({
      runtimeRoot,
      executeResult: async () => {
        throw new Error("exec blew up");
      },
    });

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      }),
    ).rejects.toThrow("exec blew up");
    expect(state.caseCleanups).toBe(1);
    expect(state.runCleanups).toBe(1);
    expect(await exists(state.caseRuntimeDirs.get(onlyAttempt("skip-case")) ?? "")).toBe(false);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
  });

  it("skips case preparation and execution when the run is already aborted", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane();
    const abortController = new AbortController();
    abortController.abort();

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      abortSignal: abortController.signal,
      lane,
    });

    // Aborted cases are dropped from results rather than reported as skips.
    expect(state.preparedCaseIds).toStrictEqual([]);
    expect(state.executed).toStrictEqual([]);
    expect(result.results).toStrictEqual([]);
    expect(state.runCleanups).toBe(1);
  });

  it("releases each case's runtime state after its output is captured and the run's at the end", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
      ],
    });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({ runtimeRoot });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      concurrency: 1,
      lane,
    });

    // Sequential cases: case-a's runtime directory is gone before case-b executes, while the run
    // directory outlives both.
    expect(state.liveCaseDirsAtExecute.get(onlyAttempt("case-a"))).toStrictEqual([
      onlyAttempt("case-a"),
    ]);
    expect(state.liveCaseDirsAtExecute.get(onlyAttempt("case-b"))).toStrictEqual([
      onlyAttempt("case-b"),
    ]);
    expect(await exists(state.caseRuntimeDirs.get(onlyAttempt("case-b")) ?? "")).toBe(false);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
    expect(result.cleanupFailures).toBeUndefined();
    // Durable artifacts survive: the report and each case's evidence are still on disk.
    await expect(stat(result.reportPath)).resolves.toBeDefined();
    for (const caseId of ["case-a", "case-b"]) {
      await expect(
        stat(path.join(result.runDir, "cases", caseId, "attempt-1", "events.jsonl")),
      ).resolves.toBeDefined();
    }
  });

  it("keeps a running case's runtime state while a concurrent sibling is released", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
        { id: "case-c", expect: "skip" },
      ],
    });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    // case-c outlives case-a's release, so it observes what that release removed.
    const { lane, state } = createFakeLane({
      runtimeRoot,
      holdUntilReleased: (testCase) => (testCase.id === "case-c" ? "case-a" : undefined),
    });

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      concurrency: 3,
      lane,
    });

    // Every case saw its own directory while executing; a sibling's release never removed it.
    for (const caseId of ["case-a", "case-b", "case-c"]) {
      expect(state.liveCaseDirsAtExecute.get(onlyAttempt(caseId))).toContain(onlyAttempt(caseId));
      expect(await exists(state.caseRuntimeDirs.get(onlyAttempt(caseId)) ?? "")).toBe(false);
    }
    const caseCAtEnd = state.runtimeLiveAtExecuteEnd.get(onlyAttempt("case-c"));
    expect(caseCAtEnd?.caseDirs).toContain(onlyAttempt("case-c"));
    expect(caseCAtEnd?.runDir).toBe(true);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
  });

  it("releases the workspace a failed run preparation left behind", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({
      runtimeRoot,
      prepareRunError: new Error("run staging blew up"),
    });

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      }),
    ).rejects.toThrow("run staging blew up");
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
    expect(state.runCleanups).toBe(0);
  });

  it("lets running siblings finish before a failed case releases the run", async () => {
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      cases: [
        { id: "case-a", expect: "invoke" },
        { id: "case-b", expect: "skip" },
        { id: "case-c", expect: "skip" },
      ],
    });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    // case-a fails to stage while case-b executes; case-c must never start.
    const { lane, state } = createFakeLane({
      runtimeRoot,
      prepareCaseError: (testCase) =>
        testCase.id === "case-a" ? new Error("staging blew up") : undefined,
      holdUntilReleased: (testCase) => (testCase.id === "case-b" ? "case-a" : undefined),
    });

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        concurrency: 2,
        lane,
      }),
    ).rejects.toThrow("staging blew up");

    // case-a's failed staging was released while case-b ran; case-b's own state outlived it.
    expect(state.runtimeLiveAtExecuteEnd.get(onlyAttempt("case-b"))).toStrictEqual({
      caseDirs: [onlyAttempt("case-b")],
      runDir: true,
    });
    expect(state.preparedCaseIds).not.toContain("case-c");
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
  });

  it("retains runtime state when keepRuntime is set", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({ runtimeRoot });

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      keepRuntime: true,
      lane,
    });

    expect(await exists(state.caseRuntimeDirs.get(onlyAttempt("skip-case")) ?? "")).toBe(true);
    expect(await exists(state.runtimeDir ?? "")).toBe(true);
  });

  it("releases the runtime state a failed case preparation left behind", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({
      runtimeRoot,
      prepareCaseError: () => new Error("staging blew up"),
    });

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      }),
    ).rejects.toThrow("staging blew up");
    expect(await exists(state.caseRuntimeDirs.get(onlyAttempt("skip-case")) ?? "")).toBe(false);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
    expect(state.caseCleanups).toBe(0);
    expect(state.runCleanups).toBe(1);
  });

  it("carries a cleanup failure on the error when the run itself fails", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({
      runtimeRoot,
      executeResult: async () => {
        throw new Error("exec blew up");
      },
    });
    const runParent = path.join(runtimeRoot, "run-parent");
    await mkdir(path.join(runParent, "run"), { recursive: true });
    await chmod(runParent, 0o555);

    try {
      const failure = await runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      }).then(
        () => undefined,
        (caught: unknown) => caught as Error & { cleanupFailures?: string[] },
      );

      expect(failure?.message).toBe("exec blew up");
      expect(failure?.cleanupFailures).toHaveLength(1);
      expect(failure?.cleanupFailures?.[0]).toContain(state.runtimeDir ?? "");
    } finally {
      await chmod(runParent, 0o755);
    }
  });

  it("records a cleanup failure on the result instead of failing the run", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
    const { lane, state } = createFakeLane({ runtimeRoot });
    // A read-only parent makes the run directory unremovable; case directories stay removable.
    const runParent = path.join(runtimeRoot, "run-parent");
    await mkdir(path.join(runParent, "run"), { recursive: true });
    await chmod(runParent, 0o555);

    try {
      const result = await runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        lane,
      });

      expect(result.results).toHaveLength(1);
      expect(result.cleanupFailures).toHaveLength(1);
      expect(result.cleanupFailures?.[0]).toContain(state.runtimeDir ?? "");
      expect(await exists(state.caseRuntimeDirs.get(onlyAttempt("skip-case")) ?? "")).toBe(false);
      const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
        cleanupFailures?: string[];
      };
      expect(report.cleanupFailures).toHaveLength(1);
    } finally {
      await chmod(runParent, 0o755);
    }
  });
});
