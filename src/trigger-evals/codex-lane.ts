import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { appendEvalSectionToFile, createCanary } from "./canary.js";
import { prepareCodexHome, removeCopiedAuth } from "./codex-home.js";
import {
  type CliRunResult,
  finishCliRun,
  prepareCaseArtifacts,
  spawnStreamingCli,
  type StreamingCliOutput,
} from "./exec.js";
import { isRecord, parseJsonlEvents } from "./json.js";
import type { AgentLane, CaseExecuteOptions, LaneCase, LaneRun, LaneRunOptions } from "./lanes.js";
import type { RuntimeResources } from "./runtime.js";
import {
  appendStagedSkillCanaries,
  createStagedWorkspace,
  EVAL_MARKETPLACE_NAME,
  needsCaseWorkspace,
  pluginsToStage,
  type SkillCanary,
  stageCaseWorkspace,
  stageCodexPluginCaches,
  stagePluginCopies,
  stageRepoLocalSkill,
  type StagedPlugin,
  surveySkillDependencies,
  surveyStagedSkills,
  writeCodexMarketplaceCatalog,
} from "./staging.js";
import { readSkillFileAllowImplicitInvocation, skillTargetLabel } from "./target.js";
import type { CaseObservations, SkillTarget, TriggerCase } from "./types.js";
import { SKIP_DECISION_ITEM_BUDGET } from "./verdict.js";

// The Codex lane counts every non-reasoning item, including the workspace reconnaissance commands
// its generic command events cannot separate from decisions. Recorded gpt-6-sol runs on seeded
// workspaces read the skill file at the fifth or sixth item after two to four such commands, so
// the lane allows three items beyond the default before a run is stopped as a skip.
export const CODEX_SKIP_DECISION_ITEM_BUDGET = SKIP_DECISION_ITEM_BUDGET + 3;

type CodexLaneOptions = {
  sourceCodexHome?: string;
};

// Codex emits no skill-invocation telemetry in current CLIs, so this lane detects invocation with
// eval-only canaries appended to the bodies of the staged skill copies: one per run for the target
// and for every implicitly invokable staged plugin skill and sibling repo-local skill, so a wrong
// skill firing is attributable. Frontmatter descriptions stay
// byte-identical to the committed skills, so the trigger surface under test is never perturbed.
// Older Codex CLIs emitted codex.skill.injected stderr telemetry, kept as a secondary signal.
export function createCodexLane(options: CodexLaneOptions = {}): AgentLane {
  return {
    async prepareRun(runOptions: LaneRunOptions): Promise<LaneRun> {
      const { runDir, target, model, effort, runtime } = runOptions;
      const { workspaceRoot, workspacePath } = await createStagedWorkspace();
      runtime.track(workspaceRoot);
      await mkdir(workspacePath, { recursive: true });
      // Per-case homes nest under the run home, so tracking the run home covers a case whose
      // own tracking never happened.
      const runCodexHome = runtime.track(path.join(runDir, "codex-home"));
      const targetLabel = skillTargetLabel(target);

      // Every canaried skill, plugin or repo-local, shares the per-run canary map.
      const entries = pluginsToStage(target, runOptions.extraPlugins ?? []);
      // Installed plugins are deployment context, not project files. Keep their copies and the
      // marketplace catalog outside the case cwd so project reconnaissance sees only fixture
      // workspace files, as it would in a real installed session.
      const pluginDeploymentPath = path.join(workspaceRoot, "deployment");
      const stagedPlugins: StagedPlugin[] = await stagePluginCopies(pluginDeploymentPath, entries);
      if (stagedPlugins.length > 0) {
        await writeCodexMarketplaceCatalog(pluginDeploymentPath, stagedPlugins);
      }
      const survey = await surveyStagedSkills(target, entries);
      await appendStagedSkillCanaries(pluginDeploymentPath, survey.skillCanaries);
      const skillCanaries: SkillCanary[] = survey.skillCanaries;
      const runCanaryLabels = new Map(
        skillCanaries.map((skillCanary) => [skillCanary.canary, skillCanary.skillLabel]),
      );
      const runSkillFilePatterns = new Map(
        skillCanaries.map((skillCanary) => [
          skillCanary.skillLabel,
          skillFileReadPattern(skillCanary.pluginName, skillCanary.skillName),
        ]),
      );
      const labels = [...survey.stagedSkillLabels];
      const skillFiles = [...survey.skillFiles];
      if (target.kind === "repo-local") {
        // The target always gets a body canary; implicitly invokable siblings get one too, so a
        // sibling stealing the invocation is attributable. Canaries land in the base workspace
        // before any case copies it, so a seeded case commits them with the rest of the skill.
        for (const repoLocalSkill of [target, ...(runOptions.extraRepoLocalSkills ?? [])]) {
          const stagedSkillFile = await stageRepoLocalSkill(
            workspacePath,
            repoLocalSkill,
            ".agents",
          );
          labels.push(repoLocalSkill.skillName);
          skillFiles.push({
            skillLabel: repoLocalSkill.skillName,
            skillName: repoLocalSkill.skillName,
            filePath: path.join(repoLocalSkill.skillPath, "SKILL.md"),
          });
          if (
            repoLocalSkill.skillName !== target.skillName &&
            !(await readSkillFileAllowImplicitInvocation(stagedSkillFile))
          ) {
            continue;
          }
          const canary = createCanary();
          await appendEvalSectionToFile(stagedSkillFile, canary);
          runCanaryLabels.set(canary, repoLocalSkill.skillName);
          runSkillFilePatterns.set(
            repoLocalSkill.skillName,
            skillFileReadPattern(undefined, repoLocalSkill.skillName),
          );
        }
      }
      const stagedSkillLabels: ReadonlySet<string> = new Set(labels);
      const skillDependencies = await surveySkillDependencies(skillFiles);

      return {
        stagedSkillLabels,
        skillDependencies,
        skipDecisionItemBudget: CODEX_SKIP_DECISION_ITEM_BUDGET,
        prepareCase: (testCase) =>
          prepareCodexCase({
            testCase,
            target,
            targetLabel,
            runDir,
            workspaceRoot,
            workspacePath,
            pluginDeploymentPath,
            model,
            effort,
            runtime,
            canaryLabels: runCanaryLabels,
            skillFilePatterns: runSkillFilePatterns,
            stagedPlugins,
            skillCanaries,
            ...(options.sourceCodexHome === undefined
              ? {}
              : { sourceCodexHome: options.sourceCodexHome }),
          }),
        cleanup: () => removeCopiedAuth(runCodexHome),
      };
    },
  };
}

type CodexCaseContext = {
  testCase: TriggerCase;
  target: SkillTarget;
  targetLabel: string;
  runDir: string;
  workspaceRoot: string;
  workspacePath: string;
  pluginDeploymentPath: string;
  model: string;
  effort: string;
  runtime: RuntimeResources;
  canaryLabels: Map<string, string>;
  skillFilePatterns: Map<string, RegExp>;
  stagedPlugins: StagedPlugin[];
  skillCanaries: SkillCanary[];
  sourceCodexHome?: string;
};

async function prepareCodexCase(context: CodexCaseContext): Promise<LaneCase> {
  const { target, testCase } = context;
  let caseWorkspacePath = context.workspacePath;
  if (target.kind !== "plugin" || needsCaseWorkspace(testCase)) {
    caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: context.workspacePath,
      workspaceRoot: context.workspaceRoot,
      repoRoot: target.repoRoot,
      testCase,
    });
  }

  // Tracked before anything is written so a setup failure still leaves nothing behind.
  const codexHome = context.runtime.track(
    path.join(context.runDir, "codex-home", "cases", testCase.id),
    testCase.id,
  );
  // The copied auth.json must be removed even when case setup fails after prepareCodexHome, so
  // the rest of the setup runs inside this try/catch; success hands cleanup to the case.
  try {
    await prepareCodexHome({
      codexHome,
      workspacePath: caseWorkspacePath,
      model: context.model,
      effort: context.effort,
      ...(context.stagedPlugins.length > 0
        ? {
            marketplaceName: EVAL_MARKETPLACE_NAME,
            marketplaceSourcePath: context.pluginDeploymentPath,
            pluginNames: context.stagedPlugins.map((stagedPlugin) => stagedPlugin.pluginName),
          }
        : {}),
      ...(context.sourceCodexHome === undefined
        ? {}
        : { sourceCodexHome: context.sourceCodexHome }),
    });
    await stageCodexPluginCaches(codexHome, context.stagedPlugins, context.skillCanaries);
  } catch (caught) {
    await removeCopiedAuth(codexHome);
    throw caught;
  }

  const sandboxMode: "read-only" | "workspace-write" =
    target.kind === "repo-local" ? "workspace-write" : "read-only";

  return {
    workspacePath: caseWorkspacePath,
    execute: (executeOptions: CaseExecuteOptions) =>
      runCodexExec({
        ...executeOptions,
        prompt: testCase.prompt,
        codexHome,
        workspacePath: caseWorkspacePath,
        sandboxMode,
      }),
    observe: (output: StreamingCliOutput) =>
      observeCodexOutput(
        output,
        target,
        context.targetLabel,
        context.canaryLabels,
        context.skillFilePatterns,
      ),
    cleanup: () => removeCopiedAuth(codexHome),
  };
}

// Matches a command that reads a staged copy of one skill's SKILL.md: under a plugin cache
// (`<plugin>/<version>/skills/<skill>/SKILL.md`), the deployment copy
// (`plugins/<plugin>/skills/<skill>/SKILL.md`), or a repo-local staging (`.agents/skills/<skill>/
// SKILL.md`). Codex loads a skill by reading its file, so the read is the invocation itself. In a
// streamed run the read item lands before any message can carry the canary, so this signal is
// what ends most invoked cases; the canary still decides a stream that completed without a read,
// and a model that ignores the eval section's stop instruction never outputs it at all.
export function skillFileReadPattern(pluginName: string | undefined, skillName: string): RegExp {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix =
    pluginName === undefined
      ? String.raw`\.agents/`
      : String.raw`(?:^|[/\s'"])${escape(pluginName)}/(?:[^/\s'"]+/)?`;
  return new RegExp(String.raw`${prefix}skills/${escape(skillName)}/SKILL\.md(?![\w.-])`);
}

// Single pass over the JSONL events for message text, executed commands, agent activity, and
// completed decision items (reasoning items are excluded because they arrive before the model
// has committed to acting), then canary, skill-file-read, and legacy-telemetry matching over the
// collected text, in that precedence when one observation carries several.
export function observeCodexOutput(
  output: StreamingCliOutput,
  target: SkillTarget,
  targetLabel: string,
  canaryLabels: ReadonlyMap<string, string>,
  skillFilePatterns: ReadonlyMap<string, RegExp>,
): CaseObservations {
  let hasActivity = false;
  let decisionItemCount = 0;
  let errorSignal: string | undefined;
  const messageTexts: string[] = [];
  const commandTexts: string[] = [];
  let lastSkillReadItem = -1;
  let lastMessageItem = -1;
  for (const event of parseJsonlEvents(output.stdout)) {
    if (!isRecord(event)) {
      continue;
    }
    if (event["type"] === "item.completed" || event["type"] === "turn.completed") {
      hasActivity = true;
    }
    // turn.failed is the terminal failure event of `codex exec --json`. Top-level error events are
    // not terminal: they also carry retry notices ("Reconnecting... 2/5") after which the turn
    // continues, so they never set the signal.
    if (event["type"] === "turn.failed") {
      errorSignal = codexErrorMessage(event) ?? "turn.failed event";
    }
    if (event["type"] !== "item.completed") {
      continue;
    }
    const item = event["item"];
    if (!isRecord(item)) {
      continue;
    }
    if (item["type"] !== "reasoning") {
      decisionItemCount += 1;
    }
    if (item["type"] === "agent_message") {
      messageTexts.push(typeof item["text"] === "string" ? item["text"] : "");
      lastMessageItem = decisionItemCount;
    }
    const command = item["type"] === "command_execution" ? item["command"] : undefined;
    // A failed command is not a read: `rg ... && cat SKILL.md` exits 1 when rg matches nothing
    // and the cat never runs, so the skill was never loaded. It still counts as a decision item.
    // A read that succeeds before a later command in the same line fails is missed the same way;
    // that conservative miss is preferred to crediting a load that never happened.
    if (typeof command === "string" && !commandFailed(item)) {
      commandTexts.push(command);
      if ([...skillFilePatterns.values()].some((pattern) => pattern.test(command))) {
        lastSkillReadItem = decisionItemCount;
      }
    }
  }

  const base = {
    hasActivity,
    decisionItemCount,
    ...(errorSignal === undefined ? {} : { errorSignal }),
  };
  const messageText = messageTexts.join("\n");
  const canaryInvoked = [...canaryLabels.entries()]
    .filter(([canary]) => messageText.includes(canary))
    .map(([, skillLabel]) => skillLabel);
  if (canaryInvoked.length > 0) {
    return { ...base, signal: "stdout-skill-canary", invokedSkills: canaryInvoked };
  }

  // Read order is preserved for reporting and for the verdict's wrong-skill selection; the
  // dependency rule itself is order-free.
  const readInvoked: string[] = [];
  for (const command of commandTexts) {
    for (const [skillLabel, pattern] of skillFilePatterns) {
      if (!readInvoked.includes(skillLabel) && pattern.test(command)) {
        readInvoked.push(skillLabel);
      }
    }
  }
  if (readInvoked.length > 0) {
    return {
      ...base,
      signal: "command-skill-read",
      invokedSkills: readInvoked,
      pendingReads: lastSkillReadItem > lastMessageItem,
    };
  }

  if (target.kind === "plugin" && output.stderr.includes("codex.skill.injected")) {
    const stderrInvoked = [...new Set([targetLabel, ...canaryLabels.values()])].filter(
      (skillLabel) => stderrNamesSkill(output.stderr, skillLabel),
    );
    if (stderrInvoked.length > 0) {
      return { ...base, signal: "stderr-skill-injected", invokedSkills: stderrInvoked };
    }
  }

  return { ...base, signal: "none", invokedSkills: [] };
}

function codexErrorMessage(event: Record<string, unknown>): string | undefined {
  const error = event["error"];
  return isRecord(error) && typeof error["message"] === "string" ? error["message"] : undefined;
}

// Boundary-match a skill label in stderr telemetry so a label is never credited from inside a
// longer sibling label (foo:bar inside foo:bar-baz).
function commandFailed(item: Record<string, unknown>): boolean {
  const exitCode = item["exit_code"];
  return item["status"] === "failed" || (typeof exitCode === "number" && exitCode !== 0);
}

function stderrNamesSkill(stderr: string, skillLabel: string): boolean {
  const escaped = skillLabel.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(?<![\w:-])${escaped}(?![\w-])`).test(stderr);
}

type CodexExecOptions = CaseExecuteOptions & {
  prompt: string;
  codexHome: string;
  workspacePath: string;
  sandboxMode: "read-only" | "workspace-write";
};

async function runCodexExec(options: CodexExecOptions): Promise<CliRunResult> {
  const paths = await prepareCaseArtifacts(options.caseDir);

  const args = [
    "-a",
    "never",
    "-s",
    options.sandboxMode,
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--color",
    "never",
    "-C",
    options.workspacePath,
    "-o",
    paths.finalMessagePath,
  ];

  args.push("--", options.prompt);

  const result = await spawnStreamingCli("codex", args, {
    cwd: options.workspacePath,
    env: { ...process.env, CODEX_HOME: options.codexHome },
    timeoutMs: options.timeoutMs,
    label: "codex exec",
    ...(options.stopWhen === undefined ? {} : { stopWhen: options.stopWhen }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
  });

  const finalMessage = await readFinalMessage(paths.finalMessagePath, result.stdout);
  return finishCliRun({ result, label: "codex exec", paths, finalMessage });
}

// A run stopped at the invocation signal or the decision-item budget is killed before codex exec
// writes its -o file, so the lane writes the last agent message there itself: every case directory
// then carries the same artifact set, and finalMessagePath always names a file that exists.
async function readFinalMessage(finalMessagePath: string, stdout: string): Promise<string> {
  try {
    return await readFile(finalMessagePath, "utf8");
  } catch (caught) {
    const finalMessage = parseLastAgentMessage(stdout);
    if (isMissingFile(caught)) {
      await writeFile(finalMessagePath, finalMessage);
    }
    return finalMessage;
  }
}

function isMissingFile(caught: unknown): boolean {
  return (
    caught instanceof Error && "code" in caught && (caught as { code?: unknown }).code === "ENOENT"
  );
}

function parseLastAgentMessage(stdout: string): string {
  let finalMessage = "";
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event) || event["type"] !== "item.completed") {
      continue;
    }

    const item = event["item"];
    if (isRecord(item) && item["type"] === "agent_message") {
      finalMessage = typeof item["text"] === "string" ? item["text"] : "";
    }
  }

  return finalMessage;
}
