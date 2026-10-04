// Eval lanes: the per-agent adapters behind one seam. A lane stages the target's deployment
// context, executes a case through its agent's CLI, and reads the raw output into normalized
// observations, so the runner and verdict stay agent-agnostic. Staging, skill-read classification,
// the Codex home, and CLI process handling are implementation details of the lanes.
export { createLane, type CreateLaneOptions } from "./create.js";
export type { CliRunResult, StreamingCliOutput } from "./exec.js";
export {
  type AgentLane,
  type CaseExecuteOptions,
  type CaseObservations,
  DEFAULT_EVAL_EFFORT,
  DEFAULT_EVAL_MODELS,
  type InvocationSignal,
  type LaneCase,
  type LaneRun,
  type LaneRunOptions,
} from "./lane.js";
