import { createClaudeLane } from "./claude-lane.js";
import { createCodexLane } from "./codex-lane.js";
import type { CliRunResult, StreamingCliOutput } from "./exec.js";
import type { MarketplacePluginEntry } from "./marketplace.js";
import type { CaseObservations, SkillTarget, TriggerCase, TriggerEvalAgent } from "./types.js";

// Trigger evals default to the models this repository's skills are used with day to day, so
// results predict real invocation behavior. Full-sweep comparisons showed trigger boundaries are
// model-specific, so proxying with smaller models measures the wrong thing. Override with
// --model/--effort to spot-check other models.
export const DEFAULT_EVAL_MODELS: Record<TriggerEvalAgent, string> = {
  claude: "opus",
  codex: "gpt-5.6-sol",
};
export const DEFAULT_EVAL_EFFORT = "medium";

export type LaneRunOptions = {
  runDir: string;
  target: SkillTarget;
  model: string;
  effort: string;
  // Plugins staged alongside the target's plugin (marketplace mode). Entries matching the target
  // plugin are deduplicated.
  extraPlugins?: MarketplacePluginEntry[];
};

// Runtime-only execution concerns; everything tied to the case's identity (prompt, staging,
// canaries) is fixed at prepareCase so a case cannot be executed against inputs it was not
// prepared for.
export type CaseExecuteOptions = {
  caseDir: string;
  timeoutMs: number;
  stopWhen?: (output: StreamingCliOutput) => boolean;
  abortSignal?: AbortSignal;
};

// One staged, executable trigger case. observe is pure over raw output so callers can use it both
// as a streaming stop condition and for the final verdict without reparsing per concern.
export type LaneCase = {
  workspacePath: string;
  execute(options: CaseExecuteOptions): Promise<CliRunResult>;
  observe(output: StreamingCliOutput): CaseObservations;
  cleanup(): Promise<void>;
};

export type LaneRun = {
  // Every staged skill's label regardless of invocation policy — manual-only skills also surface
  // in loaded-skills observations, so the isolation check must expect them.
  stagedSkillLabels: ReadonlySet<string>;
  prepareCase(testCase: TriggerCase): Promise<LaneCase>;
  cleanup(): Promise<void>;
};

// The agent seam: everything that varies between Claude and Codex — which surfaces to stage, how
// to execute a case, and how to read raw CLI output into normalized observations — lives behind
// this interface. The runner and verdict stay agent-agnostic.
export type AgentLane = {
  prepareRun(options: LaneRunOptions): Promise<LaneRun>;
};

export type CreateLaneOptions = {
  sourceCodexHome?: string;
  claudeConfigDir?: string;
};

export function createLane(agent: TriggerEvalAgent, options: CreateLaneOptions = {}): AgentLane {
  if (agent === "claude") {
    return createClaudeLane(
      options.claudeConfigDir === undefined ? {} : { configDir: options.claudeConfigDir },
    );
  }

  return createCodexLane(
    options.sourceCodexHome === undefined ? {} : { sourceCodexHome: options.sourceCodexHome },
  );
}
