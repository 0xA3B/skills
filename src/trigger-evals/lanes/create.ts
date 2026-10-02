import type { Agent } from "../../skills/index.js";
import { createClaudeLane } from "./claude.js";
import { createCodexLane } from "./codex.js";
import type { AgentLane } from "./lane.js";

export type CreateLaneOptions = {
  sourceCodexHome?: string;
  claudeConfigDir?: string;
};

export function createLane(agent: Agent, options: CreateLaneOptions = {}): AgentLane {
  if (agent === "claude") {
    return createClaudeLane(
      options.claudeConfigDir === undefined ? {} : { configDir: options.claudeConfigDir },
    );
  }

  return createCodexLane(
    options.sourceCodexHome === undefined ? {} : { sourceCodexHome: options.sourceCodexHome },
  );
}
