import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatSkillLabel } from "../../../src/skills/index.js";
import type { TriggerCase } from "../../../src/trigger-evals/fixtures/index.js";
import type { AgentLane, CaseObservations } from "../../../src/trigger-evals/lanes/index.js";
import type { TriggerEvalResult } from "../../../src/trigger-evals/runner.js";
import {
  runSelection,
  type SelectionRunOptions,
} from "../../../src/trigger-evals/selection/index.js";
import {
  buildCliRunResult,
  triggerFixtureYaml,
  writeMarketplaceCatalogs,
  writeRepoFixture,
  writeSkillFiles,
} from "../test-utils.js";

// A lane whose agent behaves exactly as each case expects: an invoke case fires the target, a
// routed skip case fires its alternate, and any other skip case fires nothing. A case named in
// failingCaseIds fires nothing instead, so an invoke case among them fails.
function createScriptedLane(failingCaseIds: ReadonlySet<string> = new Set()): AgentLane {
  return {
    async prepareRun(runOptions) {
      const targetLabel = formatSkillLabel(runOptions.target);
      const observe = (testCase: TriggerCase): CaseObservations => {
        const invoked = failingCaseIds.has(testCase.id)
          ? undefined
          : testCase.expect === "invoke"
            ? targetLabel
            : (testCase.invokeInstead ?? undefined);
        return invoked === undefined
          ? { signal: "none", invokedSkills: [], hasActivity: true, decisionItemCount: 1 }
          : {
              signal: "stdout-skill-canary",
              invokedSkills: [invoked],
              hasActivity: true,
              decisionItemCount: 1,
            };
      };
      return {
        stagedSkillLabels: new Set([targetLabel]),
        skillDependencies: new Map(),
        skipDecisionItemBudget: 5,
        async prepareCase(testCase) {
          return {
            workspacePath: "/fake",
            execute: async () => buildCliRunResult(),
            observe: () => observe(testCase),
            cleanup: async () => undefined,
          };
        },
        cleanup: async () => undefined,
      };
    },
  };
}

type Report = { info: string[]; errors: string[]; results: TriggerEvalResult[] };

async function run(
  options: Omit<SelectionRunOptions, "evalOptions" | "reporter">,
  script: { failingCaseIds?: ReadonlySet<string>; onInfo?: (message: string) => void } = {},
): Promise<{ ok: boolean; report: Report }> {
  const report: Report = { info: [], errors: [], results: [] };
  const ok = await runSelection({
    ...options,
    evalOptions: { lane: createScriptedLane(script.failingCaseIds) },
    reporter: {
      info: (message) => {
        report.info.push(message);
        script.onInfo?.(message);
      },
      error: (message) => report.errors.push(message),
      result: (result) => report.results.push(result),
    },
  });
  return { ok, report };
}

const demoSkillPath = (repoRoot: string, skillName: string) =>
  path.join(repoRoot, "plugins", "demo", "skills", skillName);
const otherSkillPath = (repoRoot: string) =>
  path.join(repoRoot, "plugins", "other", "skills", "other-skill");

// Other-skill's fixture: its own invoke case and a skip case routing to demo:auto-skill.
const routingFixture = triggerFixtureYaml([
  { id: "own-invoke", expect: "invoke", prompt: "Use the other skill." },
  {
    id: "routes-to-demo",
    expect: "skip",
    prompt: "Use the demo skill.",
    invokeInstead: "demo:auto-skill",
  },
]);

describe("runSelection", () => {
  it("runs the marketplace suite on each agent and summarizes it", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "marketplace", skillPaths: [] },
      agents: ["codex", "claude"],
    });

    expect(ok).toBe(true);
    expect(
      report.results.map((result) => [result.agent, formatSkillLabel(result.target)]),
    ).toStrictEqual([
      ["codex", "demo:auto-skill"],
      ["claude", "demo:auto-skill"],
    ]);
    expect(report.info).toStrictEqual([
      "Marketplace suite on codex: 1/1 skills passed.",
      "Marketplace suite on claude: 1/1 skills passed.",
    ]);
    expect(report.errors).toStrictEqual([]);
  });

  it("cannot end green when a case fails", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });

    const { ok, report } = await run(
      { repoRoot, selection: { mode: "plugin", pluginPath: "plugins/demo" }, agents: ["codex"] },
      { failingCaseIds: new Set(["invoke-case"]) },
    );

    expect(ok).toBe(false);
    expect(report.info).toStrictEqual(["Plugin suite on codex: 0/1 skills passed."]);
    expect(report.errors).toStrictEqual([]);
  });

  it("cannot end green when every candidate skill is manual-only", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(demoSkillPath(repoRoot, "auto-skill"), { manualOnly: true });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "plugin", pluginPath: "plugins/demo" },
      agents: ["claude"],
    });

    expect(ok).toBe(false);
    expect(report.results).toStrictEqual([]);
    expect(report.info).toStrictEqual([
      "Skipping manual-only skills on claude: plugins/demo/skills/auto-skill.",
    ]);
    expect(report.errors).toStrictEqual([
      "Plugin suite on claude: ran 0 skills — every candidate skill is manual-only or outside this agent's marketplace catalog.",
    ]);
  });

  // The skipped result runs no case, so it fails nothing; only a plugin or marketplace suite that
  // runs no skill cannot end green.
  it("ends green when a selected single skill is manual-only", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(demoSkillPath(repoRoot, "auto-skill"), { manualOnly: true });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
      agents: ["codex"],
    });

    expect(ok).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.skippedReason).toMatch(/^demo:auto-skill is manual-only/);
    expect(report.errors).toStrictEqual([]);
  });

  it("reports a selected skill whose plugin is outside the agent's catalog instead of running it", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(otherSkillPath(repoRoot), { fixture: triggerFixtureYaml() });
    await writeMarketplaceCatalogs(repoRoot, { codex: ["demo"], claude: ["demo", "other"] });

    const { ok, report } = await run({
      repoRoot,
      selection: {
        mode: "marketplace",
        skillPaths: ["plugins/demo/skills/auto-skill", "plugins/other/skills/other-skill"],
      },
      agents: ["codex"],
    });

    expect(ok).toBe(true);
    expect(report.results.map((result) => formatSkillLabel(result.target))).toStrictEqual([
      "demo:auto-skill",
    ]);
    expect(report.info).toStrictEqual([
      "Skipping skills whose plugin is not in the codex marketplace catalog: plugins/other/skills/other-skill.",
      "Marketplace suite on codex: 1/1 skills passed.",
    ]);
  });

  it("runs the dependent cases that route to the selected skill under their own fixture", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(otherSkillPath(repoRoot), { fixture: routingFixture });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
      agents: ["codex"],
      withDependents: true,
    });

    expect(ok).toBe(true);
    const dependentResult = report.results[1];
    expect(dependentResult && formatSkillLabel(dependentResult.target)).toBe("other:other-skill");
    expect(
      dependentResult?.results.map((caseResult) => [caseResult.caseId, caseResult.passed]),
    ).toStrictEqual([["routes-to-demo", true]]);
    expect(report.info).toStrictEqual([
      "Dependent cases in other:other-skill routing to demo:auto-skill: routes-to-demo.",
      "Dependent fixtures on codex: 1/1 passed.",
    ]);
  });

  it("says so when no dependent case routes to the selected skill", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
      agents: ["codex"],
      withDependents: true,
    });

    expect(ok).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.info).toStrictEqual(["No dependent cases route to the selected skills."]);
  });

  it("cannot end green when a dependent case fails", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(otherSkillPath(repoRoot), { fixture: routingFixture });

    const { ok, report } = await run(
      {
        repoRoot,
        selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
        agents: ["codex"],
        withDependents: true,
      },
      { failingCaseIds: new Set(["routes-to-demo"]) },
    );

    expect(ok).toBe(false);
    expect(report.info).toStrictEqual([
      "Dependent cases in other:other-skill routing to demo:auto-skill: routes-to-demo.",
      "Dependent fixtures on codex: 0/1 passed.",
    ]);
    expect(report.errors).toStrictEqual([]);
  });

  it("reports dependent cases it skips because their owning skill is manual-only", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(otherSkillPath(repoRoot), { manualOnly: true, fixture: routingFixture });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
      agents: ["codex"],
      withDependents: true,
    });

    expect(ok).toBe(true);
    expect(report.results.map((result) => formatSkillLabel(result.target))).toStrictEqual([
      "demo:auto-skill",
    ]);
    expect(report.info).toStrictEqual([
      "Skipping dependent cases in other:other-skill on codex: other:other-skill is manual-only on codex.",
    ]);
  });

  it("cannot end green when a fixture the dependents scan needs is unreadable", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(otherSkillPath(repoRoot), { fixture: "version: [unclosed\n" });

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "skill", skillPath: "plugins/demo/skills/auto-skill" },
      agents: ["codex"],
      withDependents: true,
    });

    expect(ok).toBe(false);
    // The selected skill's own suite still runs.
    expect(report.results).toHaveLength(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(
      /^ERROR: could not scan the fixture of plugins\/other\/skills\/other-skill for dependent cases/,
    );
  });

  it("runs nothing once the run is aborted", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const abortController = new AbortController();
    abortController.abort();

    const { ok, report } = await run({
      repoRoot,
      selection: { mode: "marketplace", skillPaths: [] },
      agents: ["codex"],
      abortSignal: abortController.signal,
    });

    expect(ok).toBe(false);
    expect(report).toStrictEqual({ info: [], errors: [], results: [] });
  });

  it("reports no empty suite when an abort lands before the suite's first skill", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeSkillFiles(demoSkillPath(repoRoot, "manual-skill"), {
      manualOnly: true,
      fixture: triggerFixtureYaml(),
    });
    const abortController = new AbortController();

    // The manual-only notice is reported after suite selection and before any skill runs.
    const { ok, report } = await run(
      {
        repoRoot,
        selection: { mode: "plugin", pluginPath: "plugins/demo" },
        agents: ["codex"],
        abortSignal: abortController.signal,
      },
      { onInfo: () => abortController.abort() },
    );

    expect(ok).toBe(false);
    expect(report).toStrictEqual({
      info: ["Skipping manual-only skills on codex: plugins/demo/skills/manual-skill."],
      errors: [],
      results: [],
    });
  });
});
