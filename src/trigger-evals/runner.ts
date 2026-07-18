import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadTriggerFixture } from "./fixtures.js";
import { type AgentLane, createLane, DEFAULT_EVAL_EFFORT, DEFAULT_EVAL_MODELS } from "./lanes.js";
import { listMarketplacePlugins } from "./marketplace.js";
import { readAllowImplicitInvocation, resolveSkillTarget, skillTargetLabel } from "./target.js";
import type { TriggerCaseResult, TriggerEvalAgent, TriggerEvalResult } from "./types.js";
import { buildCaseResult, shouldStopEarly } from "./verdict.js";

export type RunTriggerEvalOptions = {
  repoRoot?: string;
  skillPath: string;
  agent?: TriggerEvalAgent;
  fixturePath?: string;
  caseId?: string;
  model?: string;
  effort?: string;
  force?: boolean;
  timeoutMs?: number;
  concurrency?: number;
  sourceCodexHome?: string;
  claudeConfigDir?: string;
  // Stage every plugin from the agent's marketplace catalog instead of only the target's plugin,
  // so cross-plugin trigger overlap is exercised. Opt-in because full staging is less hermetic: a
  // description change in an unrelated plugin can flip results.
  stageMarketplacePlugins?: boolean;
  abortSignal?: AbortSignal;
  // Lane override for the agent seam; defaults to the agent's real lane. Primarily an
  // orchestration test seam.
  lane?: AgentLane;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CONCURRENCY = 3;

export async function runTriggerEval(options: RunTriggerEvalOptions): Promise<TriggerEvalResult> {
  const runStartedAt = Date.now();
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const agent: TriggerEvalAgent = options.agent ?? "codex";
  const target = resolveSkillTarget(repoRoot, options.skillPath);
  const model = options.model ?? DEFAULT_EVAL_MODELS[agent];
  const effort = options.effort ?? DEFAULT_EVAL_EFFORT;
  const allowImplicitInvocation = await readAllowImplicitInvocation(target, agent);

  if (!allowImplicitInvocation && options.force !== true) {
    const runDir = await createRunDir(repoRoot, target.skillName, agent);
    const manualOnlySource =
      agent === "claude"
        ? '"disable-model-invocation: true" in SKILL.md frontmatter'
        : "policy.allow_implicit_invocation: false in agents/openai.yaml";
    const skippedReason = `${skillTargetLabel(target)} is manual-only (${manualOnlySource}). Trigger optimization is intended for implicitly invokable skills.`;
    const reportPath = path.join(runDir, "report.json");
    const result = {
      runDir,
      reportPath,
      target,
      agent,
      durationMs: Date.now() - runStartedAt,
      results: [],
      skippedReason,
    };
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    return result;
  }

  const fixtureOptions = options.caseId === undefined ? {} : { caseId: options.caseId };
  const fixture = await loadTriggerFixture(
    options.fixturePath ?? target.fixturePath,
    fixtureOptions,
  );
  const runDir = await createRunDir(repoRoot, target.skillName, agent);
  if (options.stageMarketplacePlugins === true && target.kind !== "plugin") {
    throw new Error("Marketplace staging applies to plugin skills, not repo-local skills.");
  }
  const lane =
    options.lane ??
    createLane(agent, {
      ...(options.sourceCodexHome === undefined
        ? {}
        : { sourceCodexHome: options.sourceCodexHome }),
      ...(options.claudeConfigDir === undefined
        ? {}
        : { claudeConfigDir: options.claudeConfigDir }),
    });
  const laneRun = await lane.prepareRun({
    runDir,
    target,
    model,
    effort,
    ...(options.stageMarketplacePlugins === true
      ? { extraPlugins: await listMarketplacePlugins(repoRoot, agent) }
      : {}),
  });
  const targetLabel = skillTargetLabel(target);

  const results: Array<TriggerCaseResult | undefined> = new Array(fixture.cases.length);
  const concurrency = normalizeConcurrency(options.concurrency ?? DEFAULT_CONCURRENCY);
  try {
    await runConcurrently(fixture.cases, concurrency, async (testCase, index) => {
      if (options.abortSignal?.aborted === true) {
        return;
      }
      const caseDir = path.join(runDir, "cases", testCase.id);
      const laneCase = await laneRun.prepareCase(testCase);
      try {
        const caseStartedAt = Date.now();
        const runResult = await laneCase.execute({
          caseDir,
          timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          stopWhen: (output) => shouldStopEarly(laneCase.observe(output)),
          ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
        });
        results[index] = buildCaseResult({
          testCase,
          targetLabel,
          stagedSkillLabels: laneRun.stagedSkillLabels,
          observations: laneCase.observe(runResult),
          runResult,
          durationMs: Date.now() - caseStartedAt,
        });
      } finally {
        await laneCase.cleanup();
      }
    });
  } finally {
    await laneRun.cleanup();
  }

  const reportPath = path.join(runDir, "report.json");
  const result = {
    runDir,
    reportPath,
    target,
    agent,
    durationMs: Date.now() - runStartedAt,
    results: results.filter(isDefined),
  };
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  return result;
}

async function runConcurrently<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }
      await worker(item, currentIndex);
    }
  });
  await Promise.all(workers);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeConcurrency(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("concurrency must be a positive integer.");
  }
  return value;
}

async function createRunDir(
  repoRoot: string,
  skillName: string,
  agent: TriggerEvalAgent,
): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomUUID().slice(0, 8);
  const runDir = path.join(
    repoRoot,
    ".local",
    "skill-evals",
    "trigger",
    `${timestamp}-${sanitize(skillName)}-${agent}-${suffix}`,
  );
  await mkdir(runDir, { recursive: true });
  return runDir;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
