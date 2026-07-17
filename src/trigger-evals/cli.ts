#!/usr/bin/env node

import {
  HelpRequested,
  parseTriggerEvalCliOptions,
  type TriggerEvalSelection,
  usage,
} from "./cli-options.js";
import { printTriggerEvalResult } from "./output.js";
import { runTriggerEval } from "./runner.js";
import { selectMarketplaceSuite, selectPluginSuite, type TriggerEvalSuite } from "./suite.js";
import type { TriggerEvalAgent } from "./types.js";

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
    const { agents, selection, ...runOptions } = options;
    try {
      for (const agent of agents) {
        if (abortController.signal.aborted) {
          break;
        }
        const suite = await resolveSuite(selection, agent);
        if (suite.manualOnlySkillPaths.length > 0) {
          console.log(
            `Skipping manual-only skills on ${agent}: ${suite.manualOnlySkillPaths.join(", ")}.`,
          );
        }

        let passedSkills = 0;
        let ranSkills = 0;
        for (const skillPath of suite.skillPaths) {
          if (abortController.signal.aborted) {
            break;
          }
          const result = await runTriggerEval({
            ...runOptions,
            skillPath,
            agent,
            stageMarketplacePlugins: selection.mode === "marketplace",
            abortSignal: abortController.signal,
          });
          printTriggerEvalResult(result);
          ranSkills += 1;
          if (
            result.skippedReason === undefined &&
            result.results.every((caseResult) => caseResult.passed)
          ) {
            passedSkills += 1;
          }
        }

        if (selection.mode !== "skill") {
          const suiteName = selection.mode === "plugin" ? "Plugin" : "Marketplace";
          if (ranSkills > 0) {
            console.log(
              `${suiteName} suite on ${agent}: ${passedSkills}/${ranSkills} skills passed.`,
            );
          } else if (!abortController.signal.aborted) {
            // Zero runs must not read as a green suite: this happens when every fixture-bearing
            // skill is manual-only on this agent, so no eval actually executed.
            console.error(
              `${suiteName} suite on ${agent}: ran 0 skills — every fixture-bearing skill is manual-only on this agent.`,
            );
            process.exitCode = 1;
          }
        }
      }
    } catch (caught: unknown) {
      console.error(caught instanceof Error ? caught.message : String(caught));
      process.exitCode = 1;
    }
  }
}

// Suite membership is per agent: invocation policy and the marketplace catalog both differ
// between Claude and Codex.
async function resolveSuite(
  selection: TriggerEvalSelection,
  agent: TriggerEvalAgent,
): Promise<TriggerEvalSuite> {
  const repoRoot = process.cwd();
  if (selection.mode === "skill") {
    return { skillPaths: [selection.skillPath], manualOnlySkillPaths: [] };
  }
  if (selection.mode === "plugin") {
    return selectPluginSuite(repoRoot, selection.pluginPath, agent);
  }

  return selectMarketplaceSuite(repoRoot, agent);
}

void main();
