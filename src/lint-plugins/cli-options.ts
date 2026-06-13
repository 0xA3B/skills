import { parseArgs } from "node:util";

import type { ValidationOptions } from "./diagnostics.js";

export function parseCliOptions(args: readonly string[]): ValidationOptions {
  const parsed = parseLintPluginArgs(args);

  return { externalValidationEnabled: parsed.values.external === true };
}

function parseLintPluginArgs(args: readonly string[]) {
  try {
    return parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: {
        external: { type: "boolean" },
      },
    });
  } catch (caught: unknown) {
    throw normalizeParseArgsError(caught);
  }
}

function normalizeParseArgsError(caught: unknown): Error {
  if (!isParseArgsError(caught)) {
    return caught instanceof Error ? caught : new Error(String(caught));
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
