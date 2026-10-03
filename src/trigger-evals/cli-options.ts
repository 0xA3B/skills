import { parseArgs } from "node:util";

import type { Agent } from "../skills/index.js";
import { parseSeedArgument } from "./fixtures/index.js";
import type { RunTriggerEvalOptions } from "./runner.js";
import type { SelectionEvalOptions, TriggerEvalSelection } from "./selection/index.js";

export type TriggerEvalCliOptions = Omit<SelectionEvalOptions, "lane"> & {
  agents: Agent[];
  selection: TriggerEvalSelection;
  // Also run the dependent cases: routing assertions in other fixtures that name a selected skill.
  withDependents?: true;
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
    options.caseIds = [readStringOption(parsed.values.case, "--case")];
  }
  if (parsed.values.model !== undefined) {
    options.model = readStringOption(parsed.values.model, "--model");
  }
  if (parsed.values.effort !== undefined) {
    options.effort = readStringOption(parsed.values.effort, "--effort");
  }
  if (parsed.values["timeout-ms"] !== undefined) {
    options.timeoutMs = parsePositiveInteger(parsed.values["timeout-ms"], "--timeout-ms");
  }
  if (parsed.values.concurrency !== undefined) {
    options.concurrency = parsePositiveInteger(parsed.values.concurrency, "--concurrency");
  }
  if (parsed.values.repeat !== undefined) {
    options.repeat = parsePositiveInteger(parsed.values.repeat, "--repeat");
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
  if (parsed.values["keep-runtime"] === true) {
    options.keepRuntime = true;
  }
  if (parsed.values.force === true) {
    options.force = true;
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
      ["--case", options.caseIds !== undefined],
    ] as const) {
      if (present) {
        throw new Error(
          `${flag} requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.`,
        );
      }
    }
  }
  if (selection.mode !== "skill" && options.force === true) {
    throw new Error(
      "--force applies to single-skill runs, not --plugin, --marketplace, or --seed.",
    );
  }
  if (selection.mode === "seed" && parsed.values["with-dependents"] === true) {
    throw new Error("--with-dependents needs selected skills; a --seed selection has none.");
  }

  return {
    ...options,
    agents,
    selection,
    ...(parsed.values["with-dependents"] === true ? { withDependents: true as const } : {}),
  };
}

function parseSelection(
  values: { plugin?: boolean; marketplace?: boolean; seed?: string[] },
  positionals: string[],
): TriggerEvalSelection {
  // --plugin and --marketplace read the positionals as their paths; --seed takes none.
  const seeds = values.seed ?? [];
  const selectionFlags = [values.plugin === true, values.marketplace === true, seeds.length > 0];
  if (selectionFlags.filter(Boolean).length > 1 || (seeds.length > 0 && positionals.length > 0)) {
    throw new Error("Use one selection: a skill path, --plugin, --marketplace, or --seed.");
  }

  const [seedArgument, extraSeed] = seeds;
  if (extraSeed !== undefined) {
    throw new Error("Pass one --seed per run.");
  }
  if (seedArgument !== undefined) {
    const seedName = parseSeedArgument(seedArgument);
    if (seedName === undefined) {
      throw new Error(
        `--seed takes a kebab-case seed name or evals/seeds/<name>; received ${seedArgument}.`,
      );
    }
    return { mode: "seed", seedName };
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

function parseAgents(value: string | undefined): Agent[] {
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
    "  pnpm eval:trigger -- --seed <seed> [options]",
    "",
    "Skill paths:",
    "  plugins/<plugin>/skills/<skill>",
    "  .agents/skills/<skill>",
    "",
    "Staging:",
    "  Every run stages the target's deployment context by default: every plugin in the agent's",
    "  marketplace catalog, plus every repo-local skill when the target is repo-local. Repo-local",
    "  skills are never staged for plugin-skill targets.",
    "",
    "Options:",
    "  --agent <agent>            Agent(s) to evaluate: codex, claude, or both. Defaults to codex.",
    "  --plugin                   Run every trigger eval in the plugin at the given path.",
    "  --marketplace              Run every trigger eval in the agent's marketplace catalog. Pass",
    "                             skill paths to run only those skills' fixtures.",
    "  --seed <seed>              Run the seeded cases of one workspace seed, named as <name> or",
    "                             evals/seeds/<name>: every fixture case whose workspace resolves",
    "                             to the seed, under its own fixture and on its fixture's lanes.",
    "                             Use after a seed edit. Combines with no other selection.",
    "  --fixture <path>           Use a fixture file other than evals/triggers.yaml. Requires one",
    "                             target skill.",
    "  --case <id>                Run one trigger fixture case. Requires one target skill.",
    "  --model <model>            Model override. Defaults: codex gpt-6.1-sol, claude opus.",
    "  --effort <effort>          Reasoning effort override. Defaults to medium.",
    "  --timeout-ms <ms>          Per-case timeout. Defaults to 60000.",
    "  --concurrency <n>          Number of cases to run in parallel. Defaults to 3.",
    "  --repeat <n>               Run each case n times. A case passes only when every attempt",
    "                             passes. Defaults to 1.",
    "  --codex-home <path>        Source Codex home to copy auth/config from. Defaults to ~/.codex.",
    "  --claude-config-dir <path> CLAUDE_CONFIG_DIR for Claude runs. Defaults to the ambient value.",
    "  --with-dependents          Also run the dependent cases: skip cases in other fixtures whose",
    "                             invoke-instead names a selected skill, on the lanes their own",
    "                             fixture runs on.",
    "  --keep-runtime             Keep staged workspaces and Codex homes after the run for",
    "                             debugging. By default they are removed once each case's output",
    "                             is captured; reports and case artifacts are always kept.",
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
        // Multiple so a repeated --seed is an error instead of the last value winning.
        seed: { type: "string", multiple: true },
        fixture: { type: "string" },
        case: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        "timeout-ms": { type: "string" },
        concurrency: { type: "string" },
        repeat: { type: "string" },
        "codex-home": { type: "string" },
        "claude-config-dir": { type: "string" },
        "with-dependents": { type: "boolean" },
        "keep-runtime": { type: "boolean" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (caught: unknown) {
    throw normalizeParseArgsError(caught);
  }
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
