import { writeFile } from "node:fs/promises";
import path from "node:path";

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
  pluginsToStage,
  stageCaseWorkspace,
  stagePluginCopies,
  stageRepoLocalSkill,
  surveyStagedSkills,
  writeClaudeEvalSettings,
} from "./staging.js";
import type { CaseObservations, TriggerCase } from "./types.js";

// Read-only tool surface: trigger evals only observe whether the Skill tool fires, but the model
// may need to inspect fixture workspace files before deciding.
const EVAL_TOOLS = "Skill,Read,Glob,Grep";

type ClaudeLaneOptions = {
  configDir?: string;
};

// Claude Code invokes skills through the Skill tool, which is visible directly in the stream-json
// events, so staged skill copies stay description-pristine and no canary detection is needed.
// Plugin skills load through --plugin-dir; repo-local skills load as project skills from
// .claude/skills.
export function createClaudeLane(options: ClaudeLaneOptions = {}): AgentLane {
  return {
    async prepareRun(runOptions: LaneRunOptions): Promise<LaneRun> {
      const { target, model, effort } = runOptions;
      const { workspaceRoot, workspacePath } = await createStagedWorkspace();
      await writeClaudeEvalSettings(workspacePath);

      let stagedPluginNames: string[] = [];
      let stagedSkillLabels: ReadonlySet<string>;
      if (target.kind === "plugin") {
        const entries = pluginsToStage(target, runOptions.extraPlugins ?? []);
        const stagedPlugins = await stagePluginCopies(workspacePath, entries);
        stagedPluginNames = stagedPlugins.map((stagedPlugin) => stagedPlugin.pluginName);
        // The canaries are inert on this lane (detection uses Skill tool events), but their
        // stop-immediately instruction still cuts invoked runs short.
        const survey = await surveyStagedSkills(target, entries);
        await appendStagedSkillCanaries(workspacePath, survey.skillCanaries);
        stagedSkillLabels = new Set(survey.stagedSkillLabels);
      } else {
        await stageRepoLocalSkill(workspacePath, target, ".claude");
        stagedSkillLabels = new Set([target.skillName]);
      }

      const prepareCase = async (testCase: TriggerCase): Promise<LaneCase> => {
        const caseWorkspacePath =
          target.kind === "plugin" && testCase.workspaceFiles === undefined
            ? workspacePath
            : await stageCaseWorkspace({
                baseWorkspacePath: workspacePath,
                workspaceRoot,
                testCase,
              });
        const pluginDirs =
          target.kind === "plugin"
            ? stagedPluginNames.map((pluginName) =>
                path.join(caseWorkspacePath, "plugins", pluginName),
              )
            : undefined;

        return {
          workspacePath: caseWorkspacePath,
          execute: (executeOptions: CaseExecuteOptions) =>
            runClaudeExec({
              ...executeOptions,
              prompt: testCase.prompt,
              workspacePath: caseWorkspacePath,
              model,
              effort,
              ...(pluginDirs === undefined ? {} : { pluginDirs }),
              ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
            }),
          observe: (output: StreamingCliOutput) => observeClaudeOutput(output.stdout),
          cleanup: async () => undefined,
        };
      };

      return {
        stagedSkillLabels,
        prepareCase,
        cleanup: async () => undefined,
      };
    },
  };
}

// Single pass over the stream-json events: Skill tool_use targets, the init event's loaded-skills
// list, agent activity, and completed decision items (assistant messages; reasoning arrives
// before the model has committed to acting and is not counted).
export function observeClaudeOutput(stdout: string): CaseObservations {
  const invokedSkills: string[] = [];
  let hasActivity = false;
  let decisionItemCount = 0;
  let sawInitEvent = false;
  let loadedSkills: string[] | undefined;

  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event)) {
      continue;
    }

    if (!sawInitEvent && event["type"] === "system" && event["subtype"] === "init") {
      sawInitEvent = true;
      const skills = event["skills"];
      loadedSkills = Array.isArray(skills)
        ? skills.filter((skill): skill is string => typeof skill === "string")
        : undefined;
    }

    if (event["type"] === "assistant" || event["type"] === "result") {
      hasActivity = true;
    }
    if (event["type"] === "assistant") {
      decisionItemCount += 1;
    }

    invokedSkills.push(...listSkillToolUseTargets(event));
  }

  return {
    signal: invokedSkills.length > 0 ? "stream-skill-tool-use" : "none",
    invokedSkills,
    hasActivity,
    decisionItemCount,
    ...(loadedSkills === undefined ? {} : { loadedSkills }),
  };
}

// The Skill tool names its target under the "command" key in stream-json events; "skill" is
// accepted as a fallback shape. Attribution downstream is exact-label only: substring matching
// against the serialized tool input would credit a target for a prefix-named sibling (foo:bar
// matching inside foo:bar-baz).
function listSkillToolUseTargets(event: Record<string, unknown>): string[] {
  const message = event["message"];
  const content = isRecord(message) ? message["content"] : undefined;
  if (!Array.isArray(content)) {
    return [];
  }

  const skillLabels: string[] = [];
  for (const block of content) {
    if (!isRecord(block) || block["type"] !== "tool_use" || block["name"] !== "Skill") {
      continue;
    }
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

type ClaudeExecOptions = CaseExecuteOptions & {
  prompt: string;
  workspacePath: string;
  model: string;
  effort: string;
  pluginDirs?: string[];
  configDir?: string;
};

async function runClaudeExec(options: ClaudeExecOptions): Promise<CliRunResult> {
  const paths = await prepareCaseArtifacts(options.caseDir);

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "dontAsk",
    "--tools",
    EVAL_TOOLS,
    "--setting-sources",
    "project",
    "--model",
    options.model,
    "--effort",
    options.effort,
  ];

  for (const pluginDir of options.pluginDirs ?? []) {
    args.push("--plugin-dir", pluginDir);
  }

  args.push(options.prompt);

  const result = await spawnStreamingCli("claude", args, {
    cwd: options.workspacePath,
    env: {
      ...process.env,
      ...(options.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: options.configDir }),
    },
    timeoutMs: options.timeoutMs,
    label: "claude -p",
    ...(options.stopWhen === undefined ? {} : { stopWhen: options.stopWhen }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
  });

  const finalMessage = parseResultText(result.stdout);
  await writeFile(paths.finalMessagePath, finalMessage);

  return finishCliRun({ result, label: "claude -p", paths, finalMessage });
}

function parseResultText(stdout: string): string {
  let finalMessage = "";
  for (const event of parseJsonlEvents(stdout)) {
    if (isRecord(event) && event["type"] === "result" && typeof event["result"] === "string") {
      finalMessage = event["result"];
    }
  }

  return finalMessage;
}
