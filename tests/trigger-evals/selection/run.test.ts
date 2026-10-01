import { mkdir, writeFile } from "node:fs/promises";
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
import { buildCliRunResult, writeRepoFixture } from "../test-utils.js";

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

async function makeManualOnly(repoRoot: string): Promise<void> {
  const skillPath = path.join(repoRoot, "plugins", "demo", "skills", "auto-skill");
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    "---\nname: auto-skill\ndisable-model-invocation: true\n---\n",
  );
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    "version: 1\npolicy:\n  allow_implicit_invocation: false\n",
  );
}

async function writeOtherFixture(repoRoot: string, content: string): Promise<void> {
  const evalsPath = path.join(repoRoot, "plugins", "other", "skills", "other-skill", "evals");
  await mkdir(evalsPath, { recursive: true });
  await writeFile(path.join(evalsPath, "triggers.yaml"), content);
}

const routingFixture = [
  "version: 1",
  "cases:",
  "  - id: own-invoke",
  "    prompt: Use the other skill.",
  "    expect: invoke",
  "  - id: routes-to-demo",
  "    prompt: Use the demo skill.",
  "    expect: skip",
  "    invoke-instead: demo:auto-skill",
  "",
].join("\n");

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
    await makeManualOnly(repoRoot);

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

  it("runs the dependent cases that route to the selected skill under their own fixture", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeOtherFixture(repoRoot, routingFixture);

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

  it("cannot end green when a fixture the dependents scan needs is unreadable", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    await writeOtherFixture(repoRoot, "version: [unclosed\n");

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
    const repoRoot = await writeRepoFixture({
      marketplace: true,
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const manualEvals = path.join(repoRoot, "plugins", "demo", "skills", "manual-skill", "evals");
    await mkdir(manualEvals, { recursive: true });
    await writeFile(
      path.join(manualEvals, "triggers.yaml"),
      "version: 1\ncases:\n  - id: manual-invoke\n    prompt: Use it.\n    expect: invoke\n",
    );
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
