import { parseArgs } from "node:util";

import type { RunTriggerEvalOptions } from "./runner.js";

export function parseTriggerEvalCliOptions(argv: string[]): RunTriggerEvalOptions {
  const parsed = parseTriggerArgs(argv);
  const options: Partial<RunTriggerEvalOptions> = {};

  if (parsed.values.help === true) {
    throw new HelpRequested();
  }

  const [skillPath, extra] = parsed.positionals;
  if (skillPath === undefined || extra !== undefined) {
    throw new Error(
      "Usage: pnpm eval:trigger -- <codex_plugins/<plugin>/skills/<skill>> [options]",
    );
  }

  if (parsed.values.fixture !== undefined) {
    options.fixturePath = readStringOption(parsed.values.fixture, "--fixture");
  }
  if (parsed.values.case !== undefined) {
    options.caseId = readStringOption(parsed.values.case, "--case");
  }
  if (parsed.values.model !== undefined) {
    options.model = readStringOption(parsed.values.model, "--model");
  }
  if (parsed.values["timeout-ms"] !== undefined) {
    options.timeoutMs = parseTimeoutMs(parsed.values["timeout-ms"]);
  }
  if (parsed.values["codex-home"] !== undefined) {
    options.sourceCodexHome = readStringOption(parsed.values["codex-home"], "--codex-home");
  }
  if (parsed.values.force === true) {
    options.force = true;
  }

  return { ...options, skillPath };
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested.");
  }
}

export function usage(): string {
  return [
    "Usage: pnpm eval:trigger -- <codex_plugins/<plugin>/skills/<skill>> [options]",
    "",
    "Options:",
    "  --fixture <path>      Use a fixture file other than evals/triggers.yaml.",
    "  --case <id>           Run one trigger fixture case.",
    "  --model <model>       Override the Codex model for the eval run.",
    "  --timeout-ms <ms>     Per-case timeout. Defaults to 120000.",
    "  --codex-home <path>   Source Codex home to copy auth/config from. Defaults to ~/.codex.",
    "  --force               Run even when allow_implicit_invocation is false.",
  ].join("\n");
}

function parseTriggerArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv.filter((arg) => arg !== "--"),
      allowPositionals: true,
      options: {
        fixture: { type: "string" },
        case: { type: "string" },
        model: { type: "string" },
        "timeout-ms": { type: "string" },
        "codex-home": { type: "string" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (caught: unknown) {
    throw normalizeParseArgsError(caught);
  }
}

function parseTimeoutMs(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("--timeout-ms must be a positive integer.");
  }

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new Error("--timeout-ms must be a positive integer.");
  }

  return timeoutMs;
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
    const optionName = caught.message.match(/^Option '([^ ]+)/)?.[1];
    if (optionName !== undefined) {
      return new Error(`Missing value for ${optionName}.`);
    }
  }

  if (caught.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    const optionName = caught.message.match(/^Unknown option '([^']+)'/)?.[1];
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
