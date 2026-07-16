import crypto from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { appendEvalSectionToFile, createCanary, withTriggerEvalInstructions } from "./canary.js";
import { runClaudeExec } from "./claude-exec.js";
import { runCodexExec } from "./codex-exec.js";
import { prepareCodexHome, removeCopiedAuth } from "./codex-home.js";
import type { CliRunResult, StreamingCliOutput } from "./exec.js";
import { loadTriggerFixture } from "./fixtures.js";
import {
  EVAL_MARKETPLACE_NAME,
  prepareHarness,
  type SkillCanary,
  type StagedPlugin,
} from "./harness.js";
import { isRecord, parseJsonlEvents } from "./json.js";
import { listMarketplacePlugins } from "./marketplace.js";
import { readAllowImplicitInvocation, resolveSkillTarget, skillTargetLabel } from "./target.js";
import type {
  InvocationSignal,
  SkillTarget,
  TriggerCase,
  TriggerCaseResult,
  TriggerEvalAgent,
  TriggerEvalResult,
} from "./types.js";

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
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CONCURRENCY = 3;

// The trigger decision happens at the front of the turn, so once this many substantive items
// (agent messages, command executions — not reasoning) complete without an invocation signal, the
// run is stopped and classified as a clean skip instead of waiting for the full workflow or the
// case timeout. Observed invocations surface the canary within about three items, so five keeps
// late invocations safe while cutting long skip runs short.
const SKIP_DECISION_ITEM_BUDGET = 5;

// Trigger evals default to the models this repository's skills are used with day to day, so
// results predict real invocation behavior. Full-sweep comparisons showed trigger boundaries are
// model-specific, so proxying with smaller models measures the wrong thing. Override with
// --model/--effort to spot-check other models.
export const DEFAULT_EVAL_MODELS: Record<TriggerEvalAgent, string> = {
  claude: "opus",
  codex: "gpt-5.6-sol",
};
export const DEFAULT_EVAL_EFFORT = "medium";

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
  const harness = await prepareHarness(
    runDir,
    target,
    options.stageMarketplacePlugins === true
      ? { extraPlugins: await listMarketplacePlugins(repoRoot, agent) }
      : {},
  );
  const harnessCanaryLabels = new Map(
    harness.skillCanaries.map((skillCanary) => [skillCanary.canary, skillCanary.skillLabel]),
  );

  const results: Array<TriggerCaseResult | undefined> = new Array(fixture.cases.length);
  const concurrency = normalizeConcurrency(options.concurrency ?? DEFAULT_CONCURRENCY);
  try {
    await runConcurrently(fixture.cases, concurrency, async (testCase, index) => {
      if (options.abortSignal?.aborted === true) {
        return;
      }
      const caseDir = path.join(runDir, "cases", testCase.id);
      const caseWorkspace = await prepareCaseWorkspace({
        baseWorkspacePath: harness.workspacePath,
        workspaceRoot: harness.workspaceRoot,
        caseDir,
        target,
        testCase,
      });
      // Repo-local targets canary per case; plugin targets share the per-run canary map that also
      // names every implicitly invokable staged sibling.
      const canaryLabels =
        caseWorkspace.canary === undefined
          ? harnessCanaryLabels
          : new Map([[caseWorkspace.canary, skillTargetLabel(target)]]);

      // Any invocation — target or wrong skill — settles the trigger decision, so the run stops.
      const stopWhen = (output: StreamingCliOutput): boolean =>
        detectInvocation(output, target, canaryLabels, agent).signal !== "none" ||
        countDecisionItems(output.stdout, agent) >= SKIP_DECISION_ITEM_BUDGET;

      if (agent === "claude") {
        const claudeRunOptions = {
          workspacePath: caseWorkspace.workspacePath,
          prompt: testCase.prompt,
          caseDir,
          timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          model,
          effort,
          stopWhen,
          ...(target.kind === "plugin"
            ? {
                pluginDirs: harness.stagedPlugins.map((stagedPlugin) =>
                  path.join(caseWorkspace.workspacePath, "plugins", stagedPlugin.pluginName),
                ),
              }
            : {}),
          ...(options.claudeConfigDir === undefined ? {} : { configDir: options.claudeConfigDir }),
          ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
        };
        const caseStartedAt = Date.now();
        const claudeResult = await runClaudeExec(claudeRunOptions);
        results[index] = buildCaseResult({
          testCase,
          runResult: claudeResult,
          target,
          canaryLabels,
          durationMs: Date.now() - caseStartedAt,
          agent,
        });
        return;
      }

      const codexHome = path.join(runDir, "codex-home", "cases", testCase.id);
      // The copied auth.json must be removed even when case setup fails after prepareCodexHome,
      // so the whole setup-and-run sequence stays inside this try/finally.
      try {
        await prepareCodexHome({
          codexHome,
          workspacePath: caseWorkspace.workspacePath,
          model,
          effort,
          ...(target.kind === "plugin"
            ? {
                marketplaceName: EVAL_MARKETPLACE_NAME,
                pluginNames: harness.stagedPlugins.map((stagedPlugin) => stagedPlugin.pluginName),
              }
            : {}),
          ...(options.sourceCodexHome === undefined
            ? {}
            : { sourceCodexHome: options.sourceCodexHome }),
        });
        if (target.kind === "plugin") {
          await prepareCasePluginCaches(codexHome, harness.stagedPlugins, harness.skillCanaries);
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
          stopWhen,
          ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
        };

        const caseStartedAt = Date.now();
        const codexResult = await runCodexExec(codexRunOptions);
        results[index] = buildCaseResult({
          testCase,
          runResult: codexResult,
          target,
          canaryLabels,
          durationMs: Date.now() - caseStartedAt,
          agent,
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
    agent,
    durationMs: Date.now() - runStartedAt,
    results: results.filter(isDefined),
  };
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  return result;
}

function buildCaseResult(options: {
  testCase: { id: string; expect: "invoke" | "skip" };
  runResult: CliRunResult;
  target: SkillTarget;
  canaryLabels: Map<string, string>;
  durationMs: number;
  agent: TriggerEvalAgent;
}): TriggerCaseResult {
  const detection = detectInvocation(
    options.runResult,
    options.target,
    options.canaryLabels,
    options.agent,
  );
  const anyInvocation = detection.signal !== "none";
  const invoked = anyInvocation && detection.invokedSkill === skillTargetLabel(options.target);
  // A wrong-skill invocation fails an invoke case (the target lost the prompt to a sibling) but
  // not a skip case: the fixture only encodes expectations about the target, and a sibling firing
  // on a target-negative prompt may be exactly right. It is still recorded in invokedSkill.
  const matchedExpectation = options.testCase.expect === "invoke" ? invoked : !invoked;
  const endedBy = options.runResult.endedBy ?? "completed";
  // Any observed invocation proves the run executed, so the environmental and skip classifiers
  // only apply when no skill fired at all.
  const environmentalFailure = anyInvocation
    ? undefined
    : detectEnvironmentalFailure(options.runResult, options.agent, endedBy);
  const skipSignal = anyInvocation ? undefined : classifySkipSignal(endedBy);
  const passed = environmentalFailure === undefined && matchedExpectation;
  return {
    caseId: options.testCase.id,
    expect: options.testCase.expect,
    invocationSignal: detection.signal,
    invoked,
    ...(detection.invokedSkill === undefined ? {} : { invokedSkill: detection.invokedSkill }),
    passed,
    ...(skipSignal === undefined ? {} : { skipSignal }),
    ...(environmentalFailure === undefined ? {} : { environmentalFailure }),
    durationMs: options.durationMs,
    exitCode: options.runResult.exitCode,
    finalMessagePath: options.runResult.finalMessagePath,
    stdoutPath: options.runResult.stdoutPath,
    stderrPath: options.runResult.stderrPath,
    ...(options.runResult.error === undefined ? {} : { error: options.runResult.error }),
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
    const canary = createCanary();
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
      "plugins",
      target.pluginName,
      "skills",
      target.skillName,
      "SKILL.md",
    );
  }

  return path.join(workspacePath, ".agents", "skills", target.skillName, "SKILL.md");
}

async function prepareCasePluginCaches(
  codexHome: string,
  stagedPlugins: StagedPlugin[],
  skillCanaries: SkillCanary[],
): Promise<void> {
  for (const stagedPlugin of stagedPlugins) {
    const cachedPluginPath = path.join(
      codexHome,
      "plugins",
      "cache",
      EVAL_MARKETPLACE_NAME,
      stagedPlugin.pluginName,
      stagedPlugin.version,
    );
    await mkdir(path.dirname(cachedPluginPath), { recursive: true });
    await cp(stagedPlugin.sourcePath, cachedPluginPath, { recursive: true });
    // Codex reads skill bodies from the plugin cache, so the canaries must be present there too.
    for (const skillCanary of skillCanaries) {
      if (skillCanary.pluginName !== stagedPlugin.pluginName) {
        continue;
      }
      await appendEvalSectionToFile(
        path.join(cachedPluginPath, "skills", skillCanary.skillName, "SKILL.md"),
        skillCanary.canary,
      );
    }
  }
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

// A skip verdict is only trustworthy when the agent demonstrably ran: a case whose subprocess died
// before producing any agent output would otherwise read as a clean skip and mask an environment
// problem (bad auth, blocked network, sandbox nesting) as a trigger miss. Only checked when no
// invocation signal was observed, because an observed signal proves the run actually executed.
// The sandbox_apply marker is an OS-level (macOS Seatbelt) failure that leaves the agent alive but
// unable to execute any command, so it is checked separately from the dead-run case.
function detectEnvironmentalFailure(
  runResult: StreamingCliOutput,
  agent: TriggerEvalAgent,
  endedBy: string,
): string | undefined {
  if (runResult.stderr.includes("sandbox_apply: Operation not permitted")) {
    return (
      "sandbox_apply: Operation not permitted — case subprocesses could not apply their OS " +
      "sandbox (macOS refuses to nest Seatbelt sandboxes), so no command ran. Run trigger evals " +
      "from an unsandboxed context."
    );
  }

  if (
    endedBy !== "stop-when" &&
    endedBy !== "abort" &&
    !hasAgentActivity(runResult.stdout, agent)
  ) {
    const stderrHint = firstNonEmptyLine(runResult.stderr);
    return (
      "the run produced no agent output, so the case cannot be classified as a skip." +
      (stderrHint === undefined ? " Check the case stderr log." : ` stderr: ${stderrHint}`)
    );
  }

  return undefined;
}

function hasAgentActivity(stdout: string, agent: TriggerEvalAgent): boolean {
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event)) {
      continue;
    }
    if (agent === "claude") {
      if (event["type"] === "assistant" || event["type"] === "result") {
        return true;
      }
    } else if (event["type"] === "item.completed" || event["type"] === "turn.completed") {
      return true;
    }
  }

  return false;
}

function firstNonEmptyLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

function classifySkipSignal(endedBy: string): "completed" | "item-budget" | "timeout" | undefined {
  if (endedBy === "completed") {
    return "completed";
  }
  if (endedBy === "stop-when") {
    return "item-budget";
  }
  if (endedBy === "timeout") {
    return "timeout";
  }

  return undefined;
}

// Counts completed substantive items so a run can be stopped as a clean skip once the trigger
// decision has demonstrably been made. Reasoning items are excluded because they arrive frequently
// before the model has committed to acting.
function countDecisionItems(stdout: string, agent: TriggerEvalAgent): number {
  let count = 0;
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event)) {
      continue;
    }
    if (agent === "claude") {
      if (event["type"] === "assistant") {
        count += 1;
      }
      continue;
    }

    if (event["type"] !== "item.completed") {
      continue;
    }
    const item = event["item"];
    if (isRecord(item) && item["type"] !== "reasoning") {
      count += 1;
    }
  }

  return count;
}

type InvocationDetection = {
  signal: InvocationSignal;
  invokedSkill?: string;
};

// Claude Code invokes skills through the Skill tool, which is visible directly in the stream-json
// events. Codex evals rely on eval-only canaries appended to the staged skill copies; older Codex
// CLIs also emitted codex.skill.injected stderr telemetry, which is kept as a secondary signal.
// Both lanes name the skill that fired, so invoking the wrong staged skill is a distinct,
// attributable observation instead of an undifferentiated miss.
function detectInvocation(
  output: StreamingCliOutput,
  target: SkillTarget,
  canaryLabels: Map<string, string>,
  agent: TriggerEvalAgent,
): InvocationDetection {
  const targetLabel = skillTargetLabel(target);
  if (agent === "claude") {
    const invokedSkills = listSkillToolUseTargets(output.stdout);
    if (
      invokedSkills.includes(targetLabel) ||
      streamContainsSkillToolUse(output.stdout, targetLabel)
    ) {
      return { signal: "stream-skill-tool-use", invokedSkill: targetLabel };
    }

    const wrongSkill = invokedSkills[0];
    return wrongSkill === undefined
      ? { signal: "none" }
      : { signal: "stream-skill-tool-use", invokedSkill: wrongSkill };
  }

  if (target.kind === "plugin" && output.stderr.includes("codex.skill.injected")) {
    if (output.stderr.includes(targetLabel)) {
      return { signal: "stderr-skill-injected", invokedSkill: targetLabel };
    }
    for (const skillLabel of canaryLabels.values()) {
      if (skillLabel !== targetLabel && output.stderr.includes(skillLabel)) {
        return { signal: "stderr-skill-injected", invokedSkill: skillLabel };
      }
    }
  }

  // When the target and a wrong skill both surface canaries, the target invocation is the fact the
  // fixture asserts on, so it wins.
  const messageText = agentMessageTexts(output.stdout).join("\n");
  let wrongSkillDetection: InvocationDetection | undefined;
  for (const [canary, skillLabel] of canaryLabels) {
    if (!messageText.includes(canary)) {
      continue;
    }
    if (skillLabel === targetLabel) {
      return { signal: "stdout-skill-canary", invokedSkill: skillLabel };
    }
    wrongSkillDetection ??= { signal: "stdout-skill-canary", invokedSkill: skillLabel };
  }

  return wrongSkillDetection ?? { signal: "none" };
}

export function streamContainsSkillToolUse(stdout: string, skillLabel: string): boolean {
  for (const block of skillToolUseBlocks(stdout)) {
    if (JSON.stringify(block["input"] ?? {}).includes(skillLabel)) {
      return true;
    }
  }

  return false;
}

// The Skill tool names its target under the "command" key in stream-json events; "skill" is
// accepted as a fallback shape. streamContainsSkillToolUse stays alongside as the shape-agnostic
// matcher for the target label.
export function listSkillToolUseTargets(stdout: string): string[] {
  const skillLabels: string[] = [];
  for (const block of skillToolUseBlocks(stdout)) {
    const input = block["input"];
    if (!isRecord(input)) {
      continue;
    }
    const skillLabel = input["command"] ?? input["skill"];
    if (typeof skillLabel === "string" && skillLabel.length > 0) {
      skillLabels.push(skillLabel);
    }
  }

  return skillLabels;
}

function* skillToolUseBlocks(stdout: string): Generator<Record<string, unknown>> {
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event)) {
      continue;
    }

    const message = event["message"];
    const content = isRecord(message) ? message["content"] : undefined;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const block of content) {
      if (isRecord(block) && block["type"] === "tool_use" && block["name"] === "Skill") {
        yield block;
      }
    }
  }
}

function agentMessageTexts(stdout: string): string[] {
  const texts: string[] = [];
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event) || event["type"] !== "item.completed") {
      continue;
    }

    const item = event["item"];
    if (!isRecord(item) || item["type"] !== "agent_message") {
      continue;
    }

    texts.push(typeof item["text"] === "string" ? item["text"] : "");
  }

  return texts;
}
