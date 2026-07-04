import { parseArgs } from "node:util";

import type { RunTriggerEvalOptions } from "./runner.js";
import type { TriggerEvalAgent } from "./types.js";

export type TriggerEvalCliOptions = RunTriggerEvalOptions & {
  agents: TriggerEvalAgent[];
};

export function parseTriggerEvalCliOptions(argv: string[]): TriggerEvalCliOptions {
  const parsed = parseTriggerArgs(argv);
  const options: Partial<RunTriggerEvalOptions> = {};

  if (parsed.values.help === true) {
    throw new HelpRequested();
  }

  const [skillPath, extra] = parsed.positionals;
  if (skillPath === undefined || extra !== undefined) {
    throw new Error("Usage: pnpm eval:trigger -- <skill-path> [options]");
  }

  const agents = parseAgents(parsed.values.agent);
  if (parsed.values.fixture !== undefined) {
    options.fixturePath = readStringOption(parsed.values.fixture, "--fixture");
  }
  if (parsed.values.case !== undefined) {
    options.caseId = readStringOption(parsed.values.case, "--case");
  }
  if (parsed.values.model !== undefined) {
    options.model = readStringOption(parsed.values.model, "--model");
  }
  if (parsed.values.effort !== undefined) {
    options.effort = readStringOption(parsed.values.effort, "--effort");
  }
  if (parsed.values["timeout-ms"] !== undefined) {
    options.timeoutMs = parseTimeoutMs(parsed.values["timeout-ms"]);
  }
  if (parsed.values.concurrency !== undefined) {
    options.concurrency = parseConcurrency(parsed.values.concurrency);
  }
  if (parsed.values["codex-home"] !== undefined) {
    options.sourceCodexHome = readStringOption(parsed.values["codex-home"], "--codex-home");
  }
  if (parsed.values["claude-config-dir"] !== undefined) {
    options.claudeConfigDir = readStringOption(
      parsed.values["claude-config-dir"],
      "--claude-config-dir",
    );
  }
  if (parsed.values.force === true) {
    options.force = true;
  }

  return { ...options, agents, skillPath };
}

function parseAgents(value: string | undefined): TriggerEvalAgent[] {
  if (value === undefined || value === "codex") {
    return ["codex"];
  }
  if (value === "claude") {
    return ["claude"];
  }
  if (value === "both") {
    return ["codex", "claude"];
  }

  throw new Error('--agent must be "codex", "claude", or "both".');
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested.");
  }
}

export function usage(): string {
  return [
    "Usage: pnpm eval:trigger -- <skill-path> [options]",
    "",
    "Skill paths:",
    "  plugins/<plugin>/skills/<skill>",
    "  .agents/skills/<skill>",
    "",
    "Options:",
    "  --agent <agent>            Agent(s) to evaluate: codex, claude, or both. Defaults to codex.",
    "  --fixture <path>           Use a fixture file other than evals/triggers.yaml.",
    "  --case <id>                Run one trigger fixture case.",
    "  --model <model>            Model override. Defaults: codex gpt-5.6-luna, claude sonnet.",
    "  --effort <effort>          Reasoning effort override. Defaults to medium.",
    "  --timeout-ms <ms>          Per-case timeout. Defaults to 60000.",
    "  --concurrency <n>          Number of cases to run in parallel. Defaults to 3.",
    "  --codex-home <path>        Source Codex home to copy auth/config from. Defaults to ~/.codex.",
    "  --claude-config-dir <path> CLAUDE_CONFIG_DIR for Claude runs. Defaults to the ambient value.",
    "  --force                    Run even when allow_implicit_invocation is false.",
  ].join("\n");
}

function parseTriggerArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      allowPositionals: true,
      options: {
        agent: { type: "string" },
        fixture: { type: "string" },
        case: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        "timeout-ms": { type: "string" },
        concurrency: { type: "string" },
        "codex-home": { type: "string" },
        "claude-config-dir": { type: "string" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (caught: unknown) {
    throw normalizeParseArgsError(caught);
  }
}

function parseTimeoutMs(value: string): number {
  return parsePositiveInteger(value, "--timeout-ms");
}

function parseConcurrency(value: string): number {
  return parsePositiveInteger(value, "--concurrency");
}

function parsePositiveInteger(value: string, optionName: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

function readStringOption(value: string, optionName: string): string {
  if (value.length === 0) {
    throw new Error(`Missing value for ${optionName}.`);
  }

  return value;
}

function normalizeParseArgsError(caught: unknown): Error {
  if (!isParseArgsError(caught)) {
    return caught instanceof Error ? caught : new Error(String(caught));
  }

  if (caught.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    const optionName = caught.message.match(/^Option '(?<optionName>[^ ]+)/)?.groups?.[
      "optionName"
    ];
    if (optionName !== undefined) {
      return new Error(`Missing value for ${optionName}.`);
    }
  }

  if (caught.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    const optionName = caught.message.match(/^Unknown option '(?<optionName>[^']+)'/)?.groups?.[
      "optionName"
    ];
    if (optionName !== undefined) {
      return new Error(`Unknown option: ${optionName}`);
    }
  }

  return caught;
}

function isParseArgsError(value: unknown): value is Error & { code: string } {
  return (
    value instanceof Error &&
    "code" in value &&
    typeof (value as { code?: unknown }).code === "string"
  );
}
