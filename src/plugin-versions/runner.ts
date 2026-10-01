import { parseArgs } from "node:util";

import { checkPluginVersions, type VersionViolation } from "./check.js";

export type RunnerIo = {
  cwd: string;
  log: (line: string) => void;
  error: (line: string) => void;
};

const LISTED_PATHS = 3;

export async function runPluginVersionCheck(
  args: readonly string[],
  io: RunnerIo,
): Promise<number> {
  let base: string | undefined;
  try {
    ({ base } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      options: { base: { type: "string" } },
    }).values);
  } catch (caught: unknown) {
    io.error(optionErrorMessage(caught));
    return 1;
  }

  let result;
  try {
    result = await checkPluginVersions({ repoRoot: io.cwd, base });
  } catch (caught: unknown) {
    io.error(`Plugin version check could not run: ${errorMessage(caught)}`);
    return 1;
  }

  const since = `since the merge base with ${result.base}`;
  if (result.violations.length > 0) {
    const mergeBase = result.mergeBase.slice(0, 7);
    io.error(
      `Plugin version check failed for ${result.violations.length} plugin(s) ${since} (${mergeBase}):`,
    );
    for (const violation of result.violations) {
      io.error(`- ${violationMessage(violation)}`);
    }
    io.error(
      "Bump each plugin once per branch, sized by the plugin version policy in plugins/AGENTS.md, in plugin.json and any .claude-plugin/plugin.json.",
    );
    return 1;
  }

  io.log(
    result.checkedPlugins.length === 0
      ? `Plugin versions: no shipped plugin content changed ${since}.`
      : `Plugin versions: ${result.checkedPlugins.length} plugin(s) with shipped changes ${since}, each one increment ahead.`,
  );
  return 0;
}

function violationMessage(violation: VersionViolation): string {
  const { allowedVersions, baseVersion, changedPaths, headVersion, plugin } = violation;
  const listed = changedPaths.slice(0, LISTED_PATHS);
  const more = changedPaths.length - listed.length;
  const paths = more > 0 ? `${listed.join(", ")}, and ${more} more` : listed.join(", ");
  const changed = `${plugin}: shipped content changed (${paths})`;
  if (allowedVersions.length === 0) {
    return `${changed}, but base version ${baseVersion} is not x.y.z, so no single increment exists; found ${headVersion}.`;
  }
  const choices = `${allowedVersions.slice(0, -1).join(", ")}, or ${allowedVersions.at(-1)}`;
  return `${changed}, so version ${baseVersion} must become ${choices}; found ${headVersion}.`;
}

function optionErrorMessage(caught: unknown): string {
  if (
    caught instanceof Error &&
    "code" in caught &&
    caught.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"
  ) {
    const optionName = /^Unknown option '(?<optionName>[^']+)'/.exec(caught.message)?.groups?.[
      "optionName"
    ];
    if (optionName !== undefined) {
      return `Unknown option: ${optionName}`;
    }
  }
  return errorMessage(caught);
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
