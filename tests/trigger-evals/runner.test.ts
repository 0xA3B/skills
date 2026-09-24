import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CliRunResult, StreamingCliOutput } from "../../src/trigger-evals/exec.js";
import type {
  AgentLane,
  CaseExecuteOptions,
  LaneRunOptions,
} from "../../src/trigger-evals/lanes.js";
import { runTriggerEval } from "../../src/trigger-evals/runner.js";
import type { CaseObservations, TriggerCase } from "../../src/trigger-evals/types.js";
import { buildCliRunResult, writeRepoFixture, writeRepoLocalSkillFixture } from "./test-utils.js";

type FakeLaneOptions = {
  observationsFor?: (testCase: TriggerCase, output: StreamingCliOutput) => CaseObservations;
  executeResult?: (testCase: TriggerCase) => Promise<CliRunResult>;
  // Runtime directories the fake lane creates and tracks, mirroring a real lane's staged
  // workspace root (run scope) and per-case Codex home (case scope).
  runtimeRoot?: string;
  prepareRunError?: Error;
  prepareCaseError?: (testCase: TriggerCase) => Error | undefined;
  // Hold a case's execute until the named sibling's runtime directory has been released, so a
  // test can observe what a sibling's release did to a case that is still running.
  holdUntilReleased?: (testCase: TriggerCase) => string | undefined;
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
  caseRuntimeDirs: Map<string, string>;
  // Which case runtime directories still existed when each case executed.
  liveCaseDirsAtExecute: Map<string, string[]>;
  // Whether the case's own directory and the run directory still existed when its execute ended.
  runtimeLiveAtExecuteEnd: Map<string, { caseDir: boolean; runDir: boolean }>;
};

async function waitUntilGone(dirPath: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  let present = await exists(dirPath);
  while (present && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    present = await exists(dirPath);
  }
}

async function exists(dirPath: string): Promise<boolean> {
  try {
    await stat(dirPath);
    return true;
  } catch {
    return false;
  }
}

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
        skillDependencies: new Map(),
        skipDecisionItemBudget: 5,
        async prepareCase(testCase) {
          state.preparedCaseIds.push(testCase.id);
          if (options.runtimeRoot !== undefined) {
            const caseRuntimeDir = path.join(options.runtimeRoot, "cases", testCase.id);
            await mkdir(caseRuntimeDir, { recursive: true });
            state.caseRuntimeDirs.set(testCase.id, caseRuntimeDir);
            runOptions.runtime.track(caseRuntimeDir, testCase.id);
          }
          const prepareError = options.prepareCaseError?.(testCase);
          if (prepareError !== undefined) {
            throw prepareError;
          }
          return {
            workspacePath: `/fake/${testCase.id}`,
            observe: (output) =>
              options.observationsFor?.(testCase, output) ?? defaultObservations(testCase),
            async execute(executeOptions) {
              state.executed.push({ testCase, executeOptions });
              state.activeExecs += 1;
              state.maxActiveExecs = Math.max(state.maxActiveExecs, state.activeExecs);
              const live: string[] = [];
              for (const [caseId, caseRuntimeDir] of state.caseRuntimeDirs) {
                if (await exists(caseRuntimeDir)) {
                  live.push(caseId);
                }
              }
              state.liveCaseDirsAtExecute.set(testCase.id, live);
              // Evidence a real lane writes under the case directory, which cleanup must keep.
              await mkdir(executeOptions.caseDir, { recursive: true });
              await writeFile(path.join(executeOptions.caseDir, "events.jsonl"), "{}\n");
              try {
                if (options.executeResult !== undefined) {
                  return await options.executeResult(testCase);
                }
                const sibling = options.holdUntilReleased?.(testCase);
                const siblingDir =
                  sibling === undefined ? undefined : state.caseRuntimeDirs.get(sibling);
                if (siblingDir !== undefined) {
                  await waitUntilGone(siblingDir);
                }
                await new Promise((resolve) => setTimeout(resolve, 20));
                return buildCliRunResult();
              } finally {
                state.activeExecs -= 1;
                state.runtimeLiveAtExecuteEnd.set(testCase.id, {
                  caseDir: await exists(state.caseRuntimeDirs.get(testCase.id) ?? ""),
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
    expect(result.results.every((caseResult) => caseResult.durationMs >= 0)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(
      Math.max(...result.results.map((caseResult) => caseResult.durationMs)),
    );
    // Case artifacts land under the run directory, one directory per case; the run directory
    // names the skill and agent so codex and claude artifacts stay distinguishable on disk.
    expect(state.executed[0]?.executeOptions.caseDir).toBe(
      path.join(result.runDir, "cases", "case-a"),
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

  it("resolves per-agent default models before handing the run to the lane", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const codex = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseIds: ["skip-case"],
      lane: codex.lane,
    });
    expect(codex.state.runOptions).toMatchObject({ model: "gpt-6-sol", effort: "medium" });

    const claude = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      agent: "claude",
      caseIds: ["skip-case"],
      lane: claude.lane,
    });
    expect(claude.state.runOptions).toMatchObject({ model: "opus", effort: "medium" });
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
    expect(stopWhen?.({ stdout: "ITEM".repeat(4), stderr: "" })).toBe(false);
    expect(stopWhen?.({ stdout: "ITEM".repeat(5), stderr: "" })).toBe(true);
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

  it("cleans up the case and the run when execution fails", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane({
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
    expect(state.liveCaseDirsAtExecute.get("case-a")).toStrictEqual(["case-a"]);
    expect(state.liveCaseDirsAtExecute.get("case-b")).toStrictEqual(["case-b"]);
    expect(await exists(state.caseRuntimeDirs.get("case-b") ?? "")).toBe(false);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
    expect(result.cleanupFailures).toBeUndefined();
    // Durable artifacts survive: the report and each case's evidence are still on disk.
    await expect(stat(result.reportPath)).resolves.toBeDefined();
    for (const caseId of ["case-a", "case-b"]) {
      await expect(
        stat(path.join(result.runDir, "cases", caseId, "events.jsonl")),
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
      expect(state.liveCaseDirsAtExecute.get(caseId)).toContain(caseId);
      expect(await exists(state.caseRuntimeDirs.get(caseId) ?? "")).toBe(false);
    }
    expect(state.runtimeLiveAtExecuteEnd.get("case-c")).toStrictEqual({
      caseDir: true,
      runDir: true,
    });
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
  });

  it.each(["timeout", "abort"] as const)(
    "releases runtime state when a case ends by %s",
    async (endedBy) => {
      const repoRoot = await writeRepoFixture({ marketplace: true });
      const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "runner-runtime-"));
      const abortController = new AbortController();
      const { lane, state } = createFakeLane({
        runtimeRoot,
        executeResult: async () => {
          if (endedBy === "abort") {
            abortController.abort();
          }
          return buildCliRunResult({ endedBy, error: `fake ${endedBy}` });
        },
      });

      await runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseIds: ["skip-case"],
        abortSignal: abortController.signal,
        lane,
      });

      expect(await exists(state.caseRuntimeDirs.get("skip-case") ?? "")).toBe(false);
      expect(await exists(state.runtimeDir ?? "")).toBe(false);
    },
  );

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

    expect(state.runtimeLiveAtExecuteEnd.get("case-b")).toStrictEqual({
      caseDir: true,
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

    expect(await exists(state.caseRuntimeDirs.get("skip-case") ?? "")).toBe(true);
    expect(await exists(state.runtimeDir ?? "")).toBe(true);
  });

  it("releases runtime state and rethrows the original error when execution fails", async () => {
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
    expect(await exists(state.caseRuntimeDirs.get("skip-case") ?? "")).toBe(false);
    expect(await exists(state.runtimeDir ?? "")).toBe(false);
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
    expect(await exists(state.caseRuntimeDirs.get("skip-case") ?? "")).toBe(false);
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
      expect(await exists(state.caseRuntimeDirs.get("skip-case") ?? "")).toBe(false);
      const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
        cleanupFailures?: string[];
      };
      expect(report.cleanupFailures).toHaveLength(1);
    } finally {
      await chmod(runParent, 0o755);
    }
  });
});
