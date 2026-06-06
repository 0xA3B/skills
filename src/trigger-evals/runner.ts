import crypto from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { runCodexExec } from "./codex-exec.js";
import { prepareCodexHome, removeCopiedAuth } from "./codex-home.js";
import { loadTriggerFixture } from "./fixtures.js";
import { EVAL_MARKETPLACE_NAME, prepareHarness } from "./harness.js";
import { readAllowImplicitInvocation, resolveSkillTarget, skillTargetLabel } from "./target.js";
import type {
  PluginSkillTarget,
  SkillTarget,
  TriggerCase,
  TriggerCaseResult,
  TriggerEvalResult,
} from "./types.js";

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

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CONCURRENCY = 3;

export async function runTriggerEval(options: RunTriggerEvalOptions): Promise<TriggerEvalResult> {
  const runStartedAt = Date.now();
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const target = resolveSkillTarget(repoRoot, options.skillPath);
  const allowImplicitInvocation = await readAllowImplicitInvocation(target);

  if (!allowImplicitInvocation && options.force !== true) {
    const runDir = await createRunDir(repoRoot, target.skillName);
    const skippedReason = `${skillTargetLabel(target)} has policy.allow_implicit_invocation: false. Trigger optimization is intended for implicitly invokable skills.`;
    const reportPath = path.join(runDir, "report.json");
    const result = {
      runDir,
      reportPath,
      target,
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
      const caseWorkspace = await prepareCaseWorkspace({
        baseWorkspacePath: harness.workspacePath,
        workspaceRoot: harness.workspaceRoot,
        caseDir,
        target,
        testCase,
      });
      await prepareCodexHome({
        codexHome,
        workspacePath: caseWorkspace.workspacePath,
        ...(target.kind === "plugin"
          ? { marketplaceName: EVAL_MARKETPLACE_NAME, pluginName: target.pluginName }
          : {}),
        ...(options.sourceCodexHome === undefined
          ? {}
          : { sourceCodexHome: options.sourceCodexHome }),
      });
      if (target.kind === "plugin") {
        if (harness.pluginVersion === undefined) {
          throw new Error("Plugin trigger eval target is missing a plugin version.");
        }
        await prepareCasePluginCache(codexHome, target, harness.pluginVersion);
      }
      const sandboxMode: "read-only" | "workspace-write" =
        target.kind === "repo-local" ? "workspace-write" : "read-only";
      const codexRunOptions = {
        codexHome,
        workspacePath: caseWorkspace.workspacePath,
        prompt: testCase.prompt,
        caseDir,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        sandboxMode,
        stopWhen: (output: { stdout: string; stderr: string }) =>
          detectInvocation(output, target, caseWorkspace.canary) !== "none",
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
      };

      try {
        const caseStartedAt = Date.now();
        const codexResult = await runCodexExec(codexRunOptions);
        results[index] = buildCaseResult({
          testCase,
          codexResult,
          target,
          canary: caseWorkspace.canary,
          durationMs: Date.now() - caseStartedAt,
        });
      } finally {
        await removeCopiedAuth(codexHome);
      }
    });
  } finally {
    await removeCopiedAuth(harness.codexHome);
  }

  const reportPath = path.join(runDir, "report.json");
  const result = {
    runDir,
    reportPath,
    target,
    durationMs: Date.now() - runStartedAt,
    results: results.filter(isDefined),
  };
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  return result;
}

function buildCaseResult(options: {
  testCase: { id: string; expect: "invoke" | "skip" };
  codexResult: {
    stdout: string;
    stderr: string;
    error?: string;
    exitCode: number | null;
    finalMessagePath: string;
    stdoutPath: string;
    stderrPath: string;
  };
  target: SkillTarget;
  canary: string | undefined;
  durationMs: number;
}): TriggerCaseResult {
  const invocationSignal = detectInvocation(options.codexResult, options.target, options.canary);
  const invoked = invocationSignal !== "none";
  const matchedExpectation = options.testCase.expect === "invoke" ? invoked : !invoked;
  const passed = matchedExpectation;
  return {
    caseId: options.testCase.id,
    expect: options.testCase.expect,
    invocationSignal,
    invoked,
    passed,
    durationMs: options.durationMs,
    exitCode: options.codexResult.exitCode,
    finalMessagePath: options.codexResult.finalMessagePath,
    stdoutPath: options.codexResult.stdoutPath,
    stderrPath: options.codexResult.stderrPath,
    ...(options.codexResult.error === undefined ? {} : { error: options.codexResult.error }),
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

async function prepareCaseWorkspace(options: {
  baseWorkspacePath: string;
  workspaceRoot: string;
  caseDir: string;
  target: SkillTarget;
  testCase: TriggerCase;
}): Promise<{ workspacePath: string; canary?: string }> {
  if (options.target.kind === "plugin" && options.testCase.workspaceFiles === undefined) {
    return { workspacePath: options.baseWorkspacePath };
  }

  const workspacePath = path.join(options.workspaceRoot, "cases", options.testCase.id, "workspace");
  await mkdir(options.caseDir, { recursive: true });
  await cp(options.baseWorkspacePath, workspacePath, { recursive: true });

  for (const [relativeFilePath, content] of Object.entries(options.testCase.workspaceFiles ?? {})) {
    const absoluteFilePath = path.join(workspacePath, relativeFilePath);
    await mkdir(path.dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, content);
  }

  if (options.target.kind === "repo-local") {
    const canary = `trigger-eval-canary-${crypto.randomUUID()}`;
    await injectSkillEvalInstructions(workspacePath, options.target, canary);
    return { workspacePath, canary };
  }

  return { workspacePath };
}

async function injectSkillEvalInstructions(
  workspacePath: string,
  target: SkillTarget,
  canary: string,
): Promise<void> {
  const skillFilePath = copiedSkillFilePath(workspacePath, target);
  const content = await readFile(skillFilePath, "utf8");
  await writeFile(skillFilePath, withTriggerEvalInstructions(content, canary));
}

function copiedSkillFilePath(workspacePath: string, target: SkillTarget): string {
  if (target.kind === "plugin") {
    return path.join(
      workspacePath,
      "codex_plugins",
      target.pluginName,
      "skills",
      target.skillName,
      "SKILL.md",
    );
  }

  return path.join(workspacePath, ".agents", "skills", target.skillName, "SKILL.md");
}

function withTriggerEvalInstructions(content: string, canary: string): string {
  const evalSection = [
    "",
    "",
    "## Trigger Eval Instructions",
    "",
    "If these skill instructions are loaded during this trigger eval, include this exact token at the start of your next assistant message:",
    "",
    `\`${canary}\``,
    "",
    "After outputting the token, stop immediately. Do not inspect files, edit files, run commands, call tools, or continue the workflow.",
    "",
  ].join("\n");
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch?.[1] === undefined) {
    return `${content}${evalSection}`;
  }

  const metadata = parseYaml(frontmatterMatch[1]) as unknown;
  if (!isRecord(metadata) || typeof metadata["description"] !== "string") {
    return `${content}${evalSection}`;
  }

  const description = metadata["description"];
  metadata["description"] = `Eval only: if used, first output ${canary}. ${description}`;
  const body = content.slice(frontmatterMatch[0].length);
  return [
    "---",
    stringifyYaml(metadata).trimEnd(),
    "---",
    body.trimStart(),
    evalSection.trimStart(),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function prepareCasePluginCache(
  codexHome: string,
  target: PluginSkillTarget,
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

// Plugin skills expose a stderr telemetry canary. Repo-local skills currently do not, so the runner
// appends an eval-only canary instruction to the copied SKILL.md and checks assistant output.
function detectInvocation(
  codexResult: { stdout: string; stderr: string },
  target: SkillTarget,
  canary: string | undefined,
): "stderr-skill-injected" | "stdout-skill-canary" | "none" {
  const skillLabel = skillTargetLabel(target);
  if (
    target.kind === "plugin" &&
    codexResult.stderr.includes("codex.skill.injected") &&
    codexResult.stderr.includes(skillLabel)
  ) {
    return "stderr-skill-injected";
  }

  if (
    target.kind === "repo-local" &&
    canary !== undefined &&
    stdoutContainsCanary(codexResult.stdout, canary)
  ) {
    return "stdout-skill-canary";
  }

  return "none";
}

function stdoutContainsCanary(stdout: string, canary: string): boolean {
  for (const text of agentMessageTexts(stdout)) {
    if (text.includes(canary)) {
      return true;
    }
  }

  return false;
}

function agentMessageTexts(stdout: string): string[] {
  const texts: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (parsed.type !== "item.completed") {
        continue;
      }
      if (parsed.item?.type !== "agent_message") {
        continue;
      }
      texts.push(parsed.item.text ?? "");
    } catch {
      // Ignore non-event output.
    }
  }

  return texts;
}
