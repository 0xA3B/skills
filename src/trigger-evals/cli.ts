#!/usr/bin/env node

import { HelpRequested, parseTriggerEvalCliOptions, usage } from "./cli-options.js";
import { printTriggerEvalResult } from "./output.js";
import { runSelection } from "./selection/index.js";

const abortController = new AbortController();
const handleSignal = (signal: NodeJS.Signals): void => {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  abortController.abort();
};
process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

async function main(): Promise<void> {
  let options;
  try {
    options = parseTriggerEvalCliOptions(process.argv.slice(2));
  } catch (caught: unknown) {
    if (caught instanceof HelpRequested) {
      console.log(usage());
      process.exit(0);
    }

    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exitCode = 1;
  }

  if (options !== undefined) {
    const { agents, selection, withDependents, ...evalOptions } = options;
    try {
      const ok = await runSelection({
        repoRoot: process.cwd(),
        selection,
        agents,
        withDependents: withDependents === true,
        evalOptions,
        abortSignal: abortController.signal,
        reporter: {
          info: (message) => console.log(message),
          error: (message) => console.error(message),
          result: printTriggerEvalResult,
        },
      });
      // An interrupted run keeps the signal's exit code.
      if (!ok) {
        process.exitCode ??= 1;
      }
    } catch (caught: unknown) {
      console.error(caught instanceof Error ? caught.message : String(caught));
      for (const cleanupFailure of cleanupFailuresOf(caught)) {
        console.warn(`WARNING: runtime cleanup left ${cleanupFailure}`);
      }
      process.exitCode = 1;
    }
  }
}

// A run that failed after leaving a runtime directory behind carries the leftover on its error.
function cleanupFailuresOf(caught: unknown): string[] {
  if (typeof caught !== "object" || caught === null) {
    return [];
  }
  const failures = (caught as { cleanupFailures?: unknown }).cleanupFailures;
  return Array.isArray(failures) ? failures.filter((f): f is string => typeof f === "string") : [];
}

void main();
