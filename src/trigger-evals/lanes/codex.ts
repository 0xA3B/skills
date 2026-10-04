import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Skill } from "../../skills/index.js";
import {
  caseAttemptKey,
  needsCaseWorkspace,
  stageCaseWorkspace,
  type TriggerCase,
} from "../fixtures/index.js";
import { isRecord, parseJsonlEvents } from "../json.js";
import type { RuntimeResources } from "../runtime.js";
import { SKIP_DECISION_ITEM_BUDGET } from "../verdict.js";
import {
  EVAL_MARKETPLACE_NAME,
  prepareCodexHome,
  removeCopiedAuth,
  stageCodexPluginCaches,
  writeCodexMarketplaceCatalog,
} from "./codex-home.js";
import {
  type CliRunResult,
  finishCliRun,
  prepareCaseArtifacts,
  readCliVersion,
  spawnStreamingCli,
  type StreamingCliOutput,
} from "./exec.js";
import type {
  AgentLane,
  CaseExecuteOptions,
  CaseObservations,
  LaneCase,
  LaneRun,
  LaneRunOptions,
} from "./lane.js";
import {
  classifySkillFileAccesses,
  type InvocableSkill,
  skillOutputEvidence,
  stagedSkillAtPath,
} from "./skill-reads.js";
import { type StagedDeployment, stageDeployment } from "./staging.js";

export type { InvocableSkill } from "./skill-reads.js";

// The Codex lane counts every non-reasoning item, including the workspace reconnaissance commands
// its generic command events cannot separate from decisions. Recorded gpt-6-sol runs on seeded
// workspaces read the skill file at the fifth or sixth item after two to four such commands, so
// the lane allows three items beyond the default before a run is stopped as a skip.
export const CODEX_SKIP_DECISION_ITEM_BUDGET = SKIP_DECISION_ITEM_BUDGET + 3;

type CodexLaneOptions = {
  sourceCodexHome?: string;
};

// Codex has no skill tool and its event stream has no skill event (checked on codex-cli 0.160.0:
// `exec --json`, the session rollout, and app-server all lack one), so an implicit invocation is a
// shell read of the staged SKILL.md, and this lane detects invocation from those reads. Staged
// skill copies are byte-identical to the committed skills.
export function createCodexLane(options: CodexLaneOptions = {}): AgentLane {
  return {
    async prepareRun(runOptions: LaneRunOptions): Promise<LaneRun> {
      const { runDir, target, model, effort, runtime } = runOptions;
      // Codex's event stream names neither its version nor the model, so the version is read once
      // here, before anything is staged; the requested model stands as the model.
      const agentVersion = await readCliVersion("codex");
      const deployment = await stageDeployment({
        target,
        plugins: runOptions.extraPlugins ?? [],
        repoLocalSkills: runOptions.extraRepoLocalSkills ?? [],
        repoLocalSurface: ".agents",
        runtime,
      });
      // Per-case homes nest under the run home, so tracking the run home covers a case whose
      // own tracking never happened.
      const runCodexHome = runtime.track(path.join(runDir, "codex-home"));
      if (deployment.stagedPlugins.length > 0) {
        await writeCodexMarketplaceCatalog(deployment.deploymentPath, deployment.stagedPlugins);
      }
      return {
        stagedSkillLabels: deployment.stagedSkillLabels,
        skillDependencies: deployment.skillDependencies,
        skipDecisionItemBudget: CODEX_SKIP_DECISION_ITEM_BUDGET,
        agentVersion,
        prepareCase: (testCase, attempt) =>
          prepareCodexCase({
            testCase,
            attempt,
            target,
            runDir,
            deployment,
            model,
            effort,
            runtime,
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
  attempt: number;
  target: Skill;
  runDir: string;
  deployment: StagedDeployment;
  model: string;
  effort: string;
  runtime: RuntimeResources;
  sourceCodexHome?: string;
};

async function prepareCodexCase(context: CodexCaseContext): Promise<LaneCase> {
  const { target, testCase, attempt, deployment } = context;
  // Cases run in a read-only sandbox, so a case without its own workspace content shares the base
  // workspace, as on the Claude lane.
  const caseWorkspacePath = needsCaseWorkspace(testCase)
    ? await stageCaseWorkspace({
        baseWorkspacePath: deployment.workspacePath,
        workspaceRoot: deployment.workspaceRoot,
        repoRoot: target.repoRoot,
        testCase,
        attempt,
      })
    : deployment.workspacePath;
  if (caseWorkspacePath !== deployment.workspacePath) {
    await refuseShadowingSkillFiles(caseWorkspacePath, deployment.invocableSkills);
  }

  // Tracked before anything is written so a setup failure still leaves nothing behind.
  const attemptKey = caseAttemptKey(testCase.id, attempt);
  const codexHome = context.runtime.track(
    path.join(context.runDir, "codex-home", "cases", attemptKey),
    attemptKey,
  );
  // The copied auth.json must be removed even when case setup fails after prepareCodexHome, so
  // the rest of the setup runs inside this try/catch; success hands cleanup to the case.
  try {
    await prepareCodexHome({
      codexHome,
      workspacePath: caseWorkspacePath,
      model: context.model,
      effort: context.effort,
      ...(deployment.stagedPlugins.length > 0
        ? {
            marketplaceName: EVAL_MARKETPLACE_NAME,
            marketplaceSourcePath: deployment.deploymentPath,
            pluginNames: deployment.stagedPlugins.map((stagedPlugin) => stagedPlugin.pluginName),
          }
        : {}),
      ...(context.sourceCodexHome === undefined
        ? {}
        : { sourceCodexHome: context.sourceCodexHome }),
    });
    await stageCodexPluginCaches(codexHome, deployment.stagedPlugins);
  } catch (caught) {
    await removeCopiedAuth(codexHome);
    throw caught;
  }

  return {
    workspacePath: caseWorkspacePath,
    execute: (executeOptions: CaseExecuteOptions) =>
      runCodexExec({
        ...executeOptions,
        prompt: testCase.prompt,
        codexHome,
        workspacePath: caseWorkspacePath,
      }),
    observe: (output: StreamingCliOutput) => observeCodexOutput(output, deployment.invocableSkills),
    cleanup: () => removeCopiedAuth(codexHome),
  };
}

// A seed or fixture file at a staged skill's path would turn a read of project content into a
// credited load, so the case is refused instead. Fixture content cannot reach the harness-owned
// .agents and .claude entries, where the staged repo-local copies live.
async function refuseShadowingSkillFiles(
  workspacePath: string,
  skills: readonly InvocableSkill[],
): Promise<void> {
  for (const entry of await readdir(workspacePath, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || entry.name !== "SKILL.md") {
      continue;
    }
    const relativePath = path
      .relative(workspacePath, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join("/");
    if ([".agents", ".claude", ".git"].includes(relativePath.split("/")[0] ?? "")) {
      continue;
    }
    const skillLabel = stagedSkillAtPath(relativePath, skills);
    if (skillLabel !== undefined) {
      throw new Error(
        `workspace file "${relativePath}" sits at the path of staged skill ${skillLabel}, so the Codex lane would credit a read of it as a load; move it to another path.`,
      );
    }
  }
}

// Single pass over the JSONL events for agent activity, completed decision items (reasoning items
// are excluded because they arrive before the model has committed to acting), and the staged
// skill files each command loads. Load order is preserved for reporting and for the
// verdict's wrong-skill selection; the dependency rule itself is order-free.
export function observeCodexOutput(
  output: StreamingCliOutput,
  invocableSkills: readonly InvocableSkill[],
): CaseObservations {
  let hasActivity = false;
  let decisionItemCount = 0;
  let errorSignal: string | undefined;
  const loads: string[] = [];
  const unclassified: string[] = [];
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
      lastMessageItem = decisionItemCount;
    }
    const command = item["type"] === "command_execution" ? item["command"] : undefined;
    if (typeof command !== "string") {
      continue;
    }
    const accesses = classifySkillFileAccesses(command, invocableSkills);
    unclassified.push(...accesses.unclassified);
    // The exit status covers only the command's last and-or list: `cat SKILL.md && rg x` loads
    // the skill and still exits 1, and `true || cat SKILL.md` exits 0 without running the cat. A
    // file error on the skill's path with no name line anywhere means every read of it failed.
    // Otherwise a failed command's load counts only when the output starts with the body of the
    // command's leading load, and a successful command's load only when it runs whenever the
    // command exits 0; any other load is unclassified.
    const commandOutput =
      typeof item["aggregated_output"] === "string" ? item["aggregated_output"] : "";
    for (const skillLabel of accesses.loads) {
      const skill = invocableSkills.find((candidate) => candidate.skillLabel === skillLabel);
      if (skill === undefined) {
        continue;
      }
      const evidence = skillOutputEvidence(commandOutput, skill);
      if (evidence.fileError && !evidence.nameLine) {
        continue;
      }
      const ran = commandFailed(item)
        ? skillLabel === accesses.leadingLoad && evidence.leadingBody
        : !accesses.conditionalLoads.includes(skillLabel);
      if (!ran) {
        unclassified.push(`${command} (nothing shows that the load of ${skillLabel} ran)`);
        continue;
      }
      lastSkillReadItem = decisionItemCount;
      if (!loads.includes(skillLabel)) {
        loads.push(skillLabel);
      }
    }
  }

  const base = {
    hasActivity,
    decisionItemCount,
    ...(errorSignal === undefined ? {} : { errorSignal }),
    ...(unclassified.length === 0 ? {} : { unclassifiedSkillAccess: unclassified.join("\n") }),
  };
  if (loads.length > 0) {
    return {
      ...base,
      signal: "command-skill-read",
      invokedSkills: loads,
      pendingReads: lastSkillReadItem > lastMessageItem,
    };
  }

  return { ...base, signal: "none", invokedSkills: [] };
}

function codexErrorMessage(event: Record<string, unknown>): string | undefined {
  const error = event["error"];
  return isRecord(error) && typeof error["message"] === "string" ? error["message"] : undefined;
}

function commandFailed(item: Record<string, unknown>): boolean {
  const exitCode = item["exit_code"];
  return item["status"] === "failed" || (typeof exitCode === "number" && exitCode !== 0);
}

type CodexExecOptions = CaseExecuteOptions & {
  prompt: string;
  codexHome: string;
  workspacePath: string;
};

async function runCodexExec(options: CodexExecOptions): Promise<CliRunResult> {
  const paths = await prepareCaseArtifacts(options.caseDir);

  const args = [
    "-a",
    "never",
    // A trigger decision needs only reads, and a read-only case cannot change the workspace its
    // sibling cases share.
    "-s",
    "read-only",
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
