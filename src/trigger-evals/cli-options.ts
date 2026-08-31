import { parseArgs } from "node:util";

import type { RunTriggerEvalOptions } from "./runner.js";
import type { TriggerEvalAgent } from "./types.js";

export type TriggerEvalSelection =
  | { mode: "skill"; skillPath: string }
  | { mode: "plugin"; pluginPath: string }
  // An empty skillPaths runs every marketplace skill; a non-empty list stages the full
  // marketplace but executes only the named skills' fixtures.
  | { mode: "marketplace"; skillPaths: string[] };

export type TriggerEvalCliOptions = Omit<
  RunTriggerEvalOptions,
  "skillPath" | "agent" | "abortSignal" | "lane"
> & {
  agents: TriggerEvalAgent[];
  selection: TriggerEvalSelection;
};

export function parseTriggerEvalCliOptions(argv: string[]): TriggerEvalCliOptions {
  const parsed = parseTriggerArgs(argv);
  const options: Partial<RunTriggerEvalOptions> = {};

  if (parsed.values.help === true) {
    throw new HelpRequested();
  }

  const selection = parseSelection(parsed.values, parsed.positionals);

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
  if (parsed.values.isolated === true) {
    // A marketplace selection means "everything in the catalog, competing together"; isolating
    // each skill there would contradict the very thing the selection asks for.
    if (selection.mode === "marketplace") {
      throw new Error("--isolated stages only the target's own surface; drop --marketplace.");
    }
    options.isolated = true;
  }

  // The per-skill narrowing flags need exactly one target skill. Besides single-skill runs, a
  // marketplace selection of one skill qualifies: that is the retest path for a single case under
  // full-marketplace staging. Multi-skill suites have no coherent per-skill narrowing.
  const narrowsToOneSkill =
    selection.mode === "skill" ||
    (selection.mode === "marketplace" && selection.skillPaths.length === 1);
  if (!narrowsToOneSkill) {
    for (const [flag, present] of [
      ["--fixture", options.fixturePath !== undefined],
      ["--case", options.caseId !== undefined],
    ] as const) {
      if (present) {
        throw new Error(
          `${flag} requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.`,
        );
      }
    }
  }
  if (selection.mode !== "skill" && options.force === true) {
    throw new Error("--force applies to single-skill runs, not --plugin or --marketplace.");
  }

  return { ...options, agents, selection };
}

function parseSelection(
  values: { plugin?: boolean; marketplace?: boolean },
  positionals: string[],
): TriggerEvalSelection {
  if (values.plugin === true && values.marketplace === true) {
    throw new Error("Use either --plugin or --marketplace, not both.");
  }

  if (values.marketplace === true) {
    return { mode: "marketplace", skillPaths: positionals };
  }

  const [firstPositional, extra] = positionals;
  if (extra !== undefined) {
    throw new Error(usageLine());
  }

  if (values.plugin === true) {
    if (firstPositional === undefined) {
      throw new Error("Usage: pnpm eval:trigger -- --plugin plugins/<plugin> [options]");
    }
    return { mode: "plugin", pluginPath: firstPositional };
  }

  if (firstPositional === undefined) {
    throw new Error(usageLine());
  }

  return { mode: "skill", skillPath: firstPositional };
}

function usageLine(): string {
  return "Usage: pnpm eval:trigger -- <skill-path> [options]";
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
    "Usage:",
    "  pnpm eval:trigger -- <skill-path> [options]",
    "  pnpm eval:trigger -- --plugin plugins/<plugin> [options]",
    "  pnpm eval:trigger -- --marketplace [skill-path ...] [options]",
    "",
    "Skill paths:",
    "  plugins/<plugin>/skills/<skill>",
    "  .agents/skills/<skill>",
    "",
    "Staging:",
    "  Every run stages the target's deployment context by default: every plugin in the agent's",
    "  marketplace catalog, plus every repo-local skill when the target is repo-local. Repo-local",
    "  skills are never staged for plugin targets.",
    "",
    "Options:",
    "  --agent <agent>            Agent(s) to evaluate: codex, claude, or both. Defaults to codex.",
    "  --plugin                   Run every trigger eval in the plugin at the given path.",
    "  --marketplace              Run every trigger eval in the agent's marketplace catalog. Pass",
    "                             skill paths to run only those skills' fixtures.",
    "  --isolated                 Stage only the target's own surface (its plugin, or the repo-local",
    "                             skill alone). Debugging aid for separating a weak description from",
    "                             an invocation lost to a competing staged skill.",
    "  --fixture <path>           Use a fixture file other than evals/triggers.yaml. Requires one",
    "                             target skill.",
    "  --case <id>                Run one trigger fixture case. Requires one target skill.",
    "  --model <model>            Model override. Defaults: codex gpt-5.6-sol, claude opus.",
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
        plugin: { type: "boolean" },
        marketplace: { type: "boolean" },
        isolated: { type: "boolean" },
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
