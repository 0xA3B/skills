import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatSkillLabel, type Skill } from "../../skills/index.js";
import { needsCaseWorkspace, stageCaseWorkspace, type TriggerCase } from "../fixtures/index.js";
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
import { type StagedDeployment, stageDeployment } from "./staging.js";

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
      // A repo-local target's siblings get canaries too, so a sibling stealing the invocation is
      // attributable.
      const deployment = await stageDeployment({
        target,
        plugins: runOptions.extraPlugins ?? [],
        repoLocalSkills: runOptions.extraRepoLocalSkills ?? [],
        repoLocalSurface: ".agents",
        canaryRepoLocalSkills: true,
        runtime,
      });
      // Per-case homes nest under the run home, so tracking the run home covers a case whose
      // own tracking never happened.
      const runCodexHome = runtime.track(path.join(runDir, "codex-home"));
      if (deployment.stagedPlugins.length > 0) {
        await writeCodexMarketplaceCatalog(deployment.deploymentPath, deployment.stagedPlugins);
      }
      // Every canaried skill, plugin or repo-local, shares the per-run canary and read maps.
      const canaryLabels = new Map(
        deployment.canaries.map((skillCanary) => [skillCanary.canary, skillCanary.skillLabel]),
      );
      const skillFilePatterns = new Map(
        deployment.canaries.map((skillCanary) => [
          skillCanary.skillLabel,
          skillFileReadPattern(skillCanary.pluginName, skillCanary.skillName),
        ]),
      );

      return {
        stagedSkillLabels: deployment.stagedSkillLabels,
        skillDependencies: deployment.skillDependencies,
        skipDecisionItemBudget: CODEX_SKIP_DECISION_ITEM_BUDGET,
        prepareCase: (testCase) =>
          prepareCodexCase({
            testCase,
            target,
            targetLabel: formatSkillLabel(target),
            runDir,
            deployment,
            model,
            effort,
            runtime,
            canaryLabels,
            skillFilePatterns,
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
  target: Skill;
  targetLabel: string;
  runDir: string;
  deployment: StagedDeployment;
  model: string;
  effort: string;
  runtime: RuntimeResources;
  canaryLabels: Map<string, string>;
  skillFilePatterns: Map<string, RegExp>;
  sourceCodexHome?: string;
};

async function prepareCodexCase(context: CodexCaseContext): Promise<LaneCase> {
  const { target, testCase, deployment } = context;
  // Cases run in a read-only sandbox, so a case without its own workspace content shares the base
  // workspace, as on the Claude lane.
  const caseWorkspacePath = needsCaseWorkspace(testCase)
    ? await stageCaseWorkspace({
        baseWorkspacePath: deployment.workspacePath,
        workspaceRoot: deployment.workspaceRoot,
        repoRoot: target.repoRoot,
        testCase,
      })
    : deployment.workspacePath;

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
    await stageCodexPluginCaches(codexHome, deployment.stagedPlugins, deployment.canaries);
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
  target: Skill,
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
  // The canary is the preferred signal, but a read of another skill in the same run is still an
  // observed load: dropping it would hide the overlap the eval exists to expose.
  if (canaryInvoked.length > 0) {
    const invokedSkills = [
      ...canaryInvoked,
      ...readInvoked.filter((skillLabel) => !canaryInvoked.includes(skillLabel)),
    ];
    return { ...base, signal: "stdout-skill-canary", invokedSkills };
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

function commandFailed(item: Record<string, unknown>): boolean {
  const exitCode = item["exit_code"];
  return item["status"] === "failed" || (typeof exitCode === "number" && exitCode !== 0);
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
