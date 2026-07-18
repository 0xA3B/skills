import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CliRunResult, StreamingCliOutput } from "./exec.js";
import type { AgentLane, CaseExecuteOptions, LaneRunOptions } from "./lanes.js";
import { runTriggerEval } from "./runner.js";
import { buildCliRunResult, writeRepoFixture, writeRepoLocalSkillFixture } from "./test-utils.js";
import type { CaseObservations, TriggerCase } from "./types.js";

type FakeLaneOptions = {
  observationsFor?: (testCase: TriggerCase, output: StreamingCliOutput) => CaseObservations;
  executeResult?: (testCase: TriggerCase) => Promise<CliRunResult>;
};

type FakeLaneState = {
  runOptions: LaneRunOptions | undefined;
  preparedCaseIds: string[];
  executed: Array<{ testCase: TriggerCase; executeOptions: CaseExecuteOptions }>;
  caseCleanups: number;
  runCleanups: number;
  activeExecs: number;
  maxActiveExecs: number;
};

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
      return {
        stagedSkillLabels: new Set(["demo:auto-skill"]),
        async prepareCase(testCase) {
          state.preparedCaseIds.push(testCase.id);
          return {
            workspacePath: `/fake/${testCase.id}`,
            observe: (output) =>
              options.observationsFor?.(testCase, output) ?? defaultObservations(testCase),
            async execute(executeOptions) {
              state.executed.push({ testCase, executeOptions });
              state.activeExecs += 1;
              state.maxActiveExecs = Math.max(state.maxActiveExecs, state.activeExecs);
              try {
                if (options.executeResult !== undefined) {
                  return await options.executeResult(testCase);
                }
                await new Promise((resolve) => setTimeout(resolve, 20));
                return buildCliRunResult();
              } finally {
                state.activeExecs -= 1;
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

  it("resolves per-agent default models before handing the run to the lane", async () => {
    const repoRoot = await writeRepoFixture();
    const codex = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseId: "skip-case",
      lane: codex.lane,
    });
    expect(codex.state.runOptions).toMatchObject({ model: "gpt-5.6-sol", effort: "medium" });

    const claude = createFakeLane();
    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      agent: "claude",
      caseId: "skip-case",
      lane: claude.lane,
    });
    expect(claude.state.runOptions).toMatchObject({ model: "opus", effort: "medium" });
  });

  it("wires lane observations into the early-stop condition", async () => {
    const repoRoot = await writeRepoFixture();
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
      caseId: "skip-case",
      lane,
    });

    const stopWhen = state.executed[0]?.executeOptions.stopWhen;
    expect(stopWhen).toBeDefined();
    expect(stopWhen?.({ stdout: "ITEM".repeat(4), stderr: "" })).toBe(false);
    expect(stopWhen?.({ stdout: "ITEM".repeat(5), stderr: "" })).toBe(true);
    expect(stopWhen?.({ stdout: "CANARY", stderr: "" })).toBe(true);
  });

  it("classifies case results from lane observations and run results", async () => {
    const repoRoot = await writeRepoFixture();
    const { lane } = createFakeLane({
      executeResult: async () =>
        buildCliRunResult({ exitCode: 1, error: "codex exec exited with code 1." }),
    });

    const result = await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseId: "skip-case",
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

  it("rejects marketplace staging for repo-local targets", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const { lane } = createFakeLane();

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: ".agents/skills/auto-skill",
        stageMarketplacePlugins: true,
        lane,
      }),
    ).rejects.toThrow("Marketplace staging applies to plugin skills");
  });

  it("hands the marketplace catalog's plugins to the lane when staging is requested", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const { lane, state } = createFakeLane();

    await runTriggerEval({
      repoRoot,
      skillPath: "plugins/demo/skills/auto-skill",
      caseId: "skip-case",
      stageMarketplacePlugins: true,
      lane,
    });

    expect(state.runOptions?.extraPlugins?.map((entry) => entry.pluginName)).toStrictEqual([
      "demo",
      "other",
    ]);
  });

  it("cleans up the case and the run when execution fails", async () => {
    const repoRoot = await writeRepoFixture();
    const { lane, state } = createFakeLane({
      executeResult: async () => {
        throw new Error("exec blew up");
      },
    });

    await expect(
      runTriggerEval({
        repoRoot,
        skillPath: "plugins/demo/skills/auto-skill",
        caseId: "skip-case",
        lane,
      }),
    ).rejects.toThrow("exec blew up");
    expect(state.caseCleanups).toBe(1);
    expect(state.runCleanups).toBe(1);
  });

  it("skips case preparation and execution when the run is already aborted", async () => {
    const repoRoot = await writeRepoFixture();
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
});
