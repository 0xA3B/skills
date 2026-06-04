import crypto from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCodexExec } from "./codex-exec.js";
import { prepareCodexHome, removeCopiedAuth } from "./codex-home.js";
import { loadTriggerFixture } from "./fixtures.js";
import { EVAL_MARKETPLACE_NAME, prepareHarness } from "./harness.js";
import { readAllowImplicitInvocation, resolveSkillTarget } from "./target.js";
import type { TriggerCaseResult, TriggerEvalResult } from "./types.js";

export type RunTriggerEvalOptions = {
  repoRoot?: string;
  skillPath: string;
  fixturePath?: string;
  caseId?: string;
  model?: string;
  force?: boolean;
  timeoutMs?: number;
  concurrency?: number;
  sourceCodexHome?: string;
  abortSignal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CONCURRENCY = 3;

export async function runTriggerEval(options: RunTriggerEvalOptions): Promise<TriggerEvalResult> {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const target = resolveSkillTarget(repoRoot, options.skillPath);
  const allowImplicitInvocation = await readAllowImplicitInvocation(target);

  if (!allowImplicitInvocation && options.force !== true) {
    const runDir = await createRunDir(repoRoot, target.skillName);
    const skippedReason = `${target.pluginName}:${target.skillName} has policy.allow_implicit_invocation: false. Trigger optimization is intended for implicitly invokable skills.`;
    const reportPath = path.join(runDir, "report.json");
    const result = { runDir, reportPath, target, results: [], skippedReason };
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    return result;
  }

  const fixtureOptions = options.caseId === undefined ? {} : { caseId: options.caseId };
  const fixture = await loadTriggerFixture(
    options.fixturePath ?? target.fixturePath,
    fixtureOptions,
  );
  const runDir = await createRunDir(repoRoot, target.skillName);
  const harness = await prepareHarness(runDir, target);

  const results: Array<TriggerCaseResult | undefined> = new Array(fixture.cases.length);
  const concurrency = normalizeConcurrency(options.concurrency ?? DEFAULT_CONCURRENCY);
  try {
    await runConcurrently(fixture.cases, concurrency, async (testCase, index) => {
      if (options.abortSignal?.aborted === true) {
        return;
      }
      const caseDir = path.join(runDir, "cases", testCase.id);
      const codexHome = path.join(runDir, "codex-home", "cases", testCase.id);
      await prepareCodexHome({
        codexHome,
        workspacePath: harness.workspacePath,
        marketplaceName: EVAL_MARKETPLACE_NAME,
        pluginName: target.pluginName,
        ...(options.sourceCodexHome === undefined
          ? {}
          : { sourceCodexHome: options.sourceCodexHome }),
      });
      await prepareCasePluginCache(codexHome, target, harness.pluginVersion);
      const codexRunOptions = {
        codexHome,
        workspacePath: harness.workspacePath,
        prompt: testCase.prompt,
        caseDir,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
      };

      try {
        const codexResult = await runCodexExec(codexRunOptions);
        results[index] = buildCaseResult(testCase, codexResult, target);
      } finally {
        await removeCopiedAuth(codexHome);
      }
    });
  } finally {
    await removeCopiedAuth(harness.codexHome);
  }

  const reportPath = path.join(runDir, "report.json");
  const result = { runDir, reportPath, target, results: results.filter(isDefined) };
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  return result;
}

function buildCaseResult(
  testCase: { id: string; expect: "invoke" | "skip" },
  codexResult: {
    stderr: string;
    error?: string;
    exitCode: number | null;
    finalMessagePath: string;
    stdoutPath: string;
    stderrPath: string;
  },
  target: { pluginName: string; skillName: string },
): TriggerCaseResult {
  const invocationSignal = detectInvocation(codexResult, target);
  const invoked = invocationSignal !== "none";
  const completed = codexResult.error === undefined && codexResult.exitCode === 0;
  const matchedExpectation = testCase.expect === "invoke" ? invoked : !invoked;
  const passed = completed && matchedExpectation;
  return {
    caseId: testCase.id,
    expect: testCase.expect,
    invocationSignal,
    invoked,
    passed,
    exitCode: codexResult.exitCode,
    finalMessagePath: codexResult.finalMessagePath,
    stdoutPath: codexResult.stdoutPath,
    stderrPath: codexResult.stderrPath,
    ...(codexResult.error === undefined ? {} : { error: codexResult.error }),
  };
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

async function prepareCasePluginCache(
  codexHome: string,
  target: { pluginName: string; pluginPath: string },
  pluginVersion: string,
): Promise<void> {
  const cachedPluginPath = path.join(
    codexHome,
    "plugins",
    "cache",
    EVAL_MARKETPLACE_NAME,
    target.pluginName,
    pluginVersion,
  );
  await mkdir(path.dirname(cachedPluginPath), { recursive: true });
  await cp(target.pluginPath, cachedPluginPath, { recursive: true });
}

async function createRunDir(repoRoot: string, skillName: string): Promise<string> {
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
    `${timestamp}-${sanitize(skillName)}-${suffix}`,
  );
  await mkdir(runDir, { recursive: true });
  return runDir;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Relies on Codex CLI emitting a stderr telemetry line containing "codex.skill.injected" and the
// skill label "<plugin>:<skill>" when a skill's body is injected into the conversation. If the log
// contract changes this will silently produce false negatives; update alongside Codex releases.
function detectInvocation(
  codexResult: { stderr: string },
  target: { pluginName: string; skillName: string },
): "stderr-skill-injected" | "none" {
  const skillLabel = `${target.pluginName}:${target.skillName}`;
  if (
    codexResult.stderr.includes("codex.skill.injected") &&
    codexResult.stderr.includes(skillLabel)
  ) {
    return "stderr-skill-injected";
  }

  return "none";
}
