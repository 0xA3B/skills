import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCanary } from "./canary.js";
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
import {
  appendStagedSkillCanaries,
  createStagedWorkspace,
  EVAL_MARKETPLACE_NAME,
  injectRepoLocalCanary,
  pluginsToStage,
  type SkillCanary,
  stageCaseWorkspace,
  stageCodexPluginCaches,
  stagePluginCopies,
  stageRepoLocalSkill,
  type StagedPlugin,
  surveyStagedSkills,
  writeCodexMarketplaceCatalog,
} from "./staging.js";
import { skillTargetLabel } from "./target.js";
import type { CaseObservations, SkillTarget, TriggerCase } from "./types.js";

type CodexLaneOptions = {
  sourceCodexHome?: string;
};

// Codex emits no skill-invocation telemetry in current CLIs, so this lane detects invocation with
// eval-only canaries appended to the staged skill copies: per-run canaries for every implicitly
// invokable staged plugin skill (so a wrong skill firing is attributable), and a per-case
// description-rewrite canary for repo-local skills, which Codex surfaces from metadata alone.
// Older Codex CLIs emitted codex.skill.injected stderr telemetry, kept as a secondary signal.
export function createCodexLane(options: CodexLaneOptions = {}): AgentLane {
  return {
    async prepareRun(runOptions: LaneRunOptions): Promise<LaneRun> {
      const { runDir, target, model, effort } = runOptions;
      const { workspaceRoot, workspacePath } = await createStagedWorkspace();
      const runCodexHome = path.join(runDir, "codex-home");
      const targetLabel = skillTargetLabel(target);

      let stagedPlugins: StagedPlugin[] = [];
      let skillCanaries: SkillCanary[] = [];
      // Plugin targets share one per-run canary map that also names every implicitly invokable
      // staged sibling; repo-local targets canary per case instead.
      let runCanaryLabels = new Map<string, string>();
      let stagedSkillLabels: ReadonlySet<string>;
      if (target.kind === "plugin") {
        const entries = pluginsToStage(target, runOptions.extraPlugins ?? []);
        stagedPlugins = await stagePluginCopies(workspacePath, entries);
        await writeCodexMarketplaceCatalog(workspacePath, stagedPlugins);
        const survey = await surveyStagedSkills(target, entries);
        await appendStagedSkillCanaries(workspacePath, survey.skillCanaries);
        skillCanaries = survey.skillCanaries;
        runCanaryLabels = new Map(
          skillCanaries.map((skillCanary) => [skillCanary.canary, skillCanary.skillLabel]),
        );
        stagedSkillLabels = new Set(survey.stagedSkillLabels);
      } else {
        await stageRepoLocalSkill(workspacePath, target, ".agents");
        stagedSkillLabels = new Set([target.skillName]);
      }

      return {
        stagedSkillLabels,
        prepareCase: (testCase) =>
          prepareCodexCase({
            testCase,
            target,
            targetLabel,
            runDir,
            workspaceRoot,
            workspacePath,
            model,
            effort,
            canaryLabels: runCanaryLabels,
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
  model: string;
  effort: string;
  canaryLabels: Map<string, string>;
  stagedPlugins: StagedPlugin[];
  skillCanaries: SkillCanary[];
  sourceCodexHome?: string;
};

async function prepareCodexCase(context: CodexCaseContext): Promise<LaneCase> {
  const { target, testCase } = context;
  let caseWorkspacePath = context.workspacePath;
  let canaryLabels = context.canaryLabels;
  if (target.kind !== "plugin" || testCase.workspaceFiles !== undefined) {
    caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: context.workspacePath,
      workspaceRoot: context.workspaceRoot,
      testCase,
    });
  }
  if (target.kind === "repo-local") {
    const canary = createCanary();
    await injectRepoLocalCanary(caseWorkspacePath, target, canary);
    canaryLabels = new Map([[canary, context.targetLabel]]);
  }

  const codexHome = path.join(context.runDir, "codex-home", "cases", testCase.id);
  // The copied auth.json must be removed even when case setup fails after prepareCodexHome, so
  // the rest of the setup runs inside this try/catch; success hands cleanup to the case.
  try {
    await prepareCodexHome({
      codexHome,
      workspacePath: caseWorkspacePath,
      model: context.model,
      effort: context.effort,
      ...(target.kind === "plugin"
        ? {
            marketplaceName: EVAL_MARKETPLACE_NAME,
            pluginNames: context.stagedPlugins.map((stagedPlugin) => stagedPlugin.pluginName),
          }
        : {}),
      ...(context.sourceCodexHome === undefined
        ? {}
        : { sourceCodexHome: context.sourceCodexHome }),
    });
    if (target.kind === "plugin") {
      await stageCodexPluginCaches(codexHome, context.stagedPlugins, context.skillCanaries);
    }
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
      observeCodexOutput(output, target, context.targetLabel, canaryLabels),
    cleanup: () => removeCopiedAuth(codexHome),
  };
}

// Single pass over the JSONL events for message text, agent activity, and completed decision
// items (reasoning items are excluded because they arrive before the model has committed to
// acting), then canary and legacy-telemetry matching over the collected text.
export function observeCodexOutput(
  output: StreamingCliOutput,
  target: SkillTarget,
  targetLabel: string,
  canaryLabels: ReadonlyMap<string, string>,
): CaseObservations {
  let hasActivity = false;
  let decisionItemCount = 0;
  const messageTexts: string[] = [];
  for (const event of parseJsonlEvents(output.stdout)) {
    if (!isRecord(event)) {
      continue;
    }
    if (event["type"] === "item.completed" || event["type"] === "turn.completed") {
      hasActivity = true;
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
    }
  }

  const base = { hasActivity, decisionItemCount };
  const messageText = messageTexts.join("\n");
  const canaryInvoked = [...canaryLabels.entries()]
    .filter(([canary]) => messageText.includes(canary))
    .map(([, skillLabel]) => skillLabel);
  if (canaryInvoked.length > 0) {
    return { ...base, signal: "stdout-skill-canary", invokedSkills: canaryInvoked };
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

// Boundary-match a skill label in stderr telemetry so a label is never credited from inside a
// longer sibling label (foo:bar inside foo:bar-baz).
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

async function readFinalMessage(finalMessagePath: string, stdout: string): Promise<string> {
  try {
    return await readFile(finalMessagePath, "utf8");
  } catch {
    return parseLastAgentMessage(stdout);
  }
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
