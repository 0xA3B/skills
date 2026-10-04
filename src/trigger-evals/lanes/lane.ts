import type { Agent, Skill, SkillDirectory } from "../../skills/index.js";
import type { TriggerCase } from "../fixtures/index.js";
import type { MarketplacePluginEntry } from "../marketplace.js";
import type { RuntimeResources } from "../runtime.js";
import type { CliRunResult, StreamingCliOutput } from "./exec.js";

// Trigger evals default to the models this repository's skills are used with day to day, so
// results predict real invocation behavior. Full-sweep comparisons showed trigger boundaries are
// model-specific, so proxying with smaller models measures the wrong thing. Override with
// --model/--effort to spot-check other models.
export const DEFAULT_EVAL_MODELS: Record<Agent, string> = {
  claude: "opus",
  codex: "gpt-6.1-sol",
};
export const DEFAULT_EVAL_EFFORT = "medium";

export type LaneRunOptions = {
  runDir: string;
  target: Skill;
  model: string;
  effort: string;
  // Registry for the runtime directories the lane creates (staged workspace roots, Codex homes).
  // The lane tracks them, run-scoped or under the attempt key; the runner releases them.
  runtime: RuntimeResources;
  // Plugins staged alongside the target's own surface (the default deployment-context staging).
  // Entries matching a plugin-skill target's own plugin are deduplicated.
  extraPlugins?: MarketplacePluginEntry[];
  // Sibling repo-local skills staged alongside a repo-local target, mirroring how this checkout
  // loads every repo-local skill together. Never set for plugin-skill targets: repo-local skills
  // do not exist in a plugin's deployment context.
  extraRepoLocalSkills?: SkillDirectory[];
};

// Runtime-only execution concerns; everything tied to the case's identity (prompt, staging) is
// fixed at prepareCase so a case cannot be executed against inputs it was not
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
  // For each staged skill, the staged skills its body names; see surveySkillDependencies.
  skillDependencies: ReadonlyMap<string, ReadonlySet<string>>;
  // Decision items a case may complete without an invocation signal before it is stopped as a
  // skip; see SKIP_DECISION_ITEM_BUDGET for the default and what a lane counts as an item.
  skipDecisionItemBudget: number;
  // The agent CLI version, when the lane reads it once for the run rather than from each case's
  // output.
  agentVersion?: string;
  // Stages one attempt of a case. Everything the lane creates for it is keyed by caseAttemptKey,
  // so attempts of one case never share or release each other's state.
  prepareCase(testCase: TriggerCase, attempt: number): Promise<LaneCase>;
  cleanup(): Promise<void>;
};

// The agent seam: everything that varies between Claude and Codex — which surfaces to stage, how
// to execute a case, and how to read raw CLI output into normalized observations — lives behind
// this interface. The runner and verdict stay agent-agnostic.
export type AgentLane = {
  prepareRun(options: LaneRunOptions): Promise<LaneRun>;
};

export type InvocationSignal = "command-skill-read" | "stream-skill-tool-use" | "none";

// Normalized observations parsed from one case's raw CLI output. Lanes produce these; verdict
// classification consumes them without knowing any agent's stream format.
export type CaseObservations = {
  signal: InvocationSignal;
  // Labels of skills whose invocation was detected, in detection order. May name skills other
  // than the target; attribution to target vs wrong skill happens in the verdict.
  invokedSkills: string[];
  hasActivity: boolean;
  // Lane-specific events that show the agent moved beyond reasoning or typed reconnaissance toward
  // a response or action. This is not a raw stream-event count.
  decisionItemCount: number;
  // Skills the agent reported loading at session start (Claude's init event); undefined when the
  // lane has no such signal.
  loadedSkills?: string[];
  // The model the requested model resolved to, and the agent CLI version, as the agent reported
  // them at session start (Claude's init event); undefined when the lane has no such signal.
  resolvedModel?: string;
  agentVersion?: string;
  // The agent runtime's own report that the turn failed (an API error, a dropped stream), quoted
  // from the lane's terminal error event. Such a run never reached a settled trigger decision.
  errorSignal?: string;
  // True while a skill-file read is the latest signal and no assistant message has completed
  // since: the agent may still be loading further skills before it speaks, so the invocation set
  // is not yet attributable. Lanes without a read signal leave it undefined.
  pendingReads?: boolean;
  // Commands that named a staged skill file in a form the lane can classify neither as a load nor
  // as an inspection, or that failed after a load without showing whether the load ran, one per
  // line. Such a command may or may not have invoked the skill, so the verdict trusts neither
  // reading of the run.
  unclassifiedSkillAccess?: string;
};
