import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { nextVersions, shippedChangesByPlugin } from "./policy.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_BASE = "origin/main";

export type VersionViolation = {
  plugin: string;
  baseVersion: string;
  headVersion: string;
  // Empty when the base version is not x.y.z, so no increment can be computed.
  allowedVersions: string[];
  // Shipped paths that changed, relative to the plugin directory.
  changedPaths: string[];
};

export type VersionCheckResult = {
  base: string;
  mergeBase: string;
  // Plugins whose shipped content changed and that exist at both the merge base and HEAD.
  checkedPlugins: string[];
  violations: VersionViolation[];
};

export type VersionCheckOptions = {
  // Any directory inside the repository; git resolves the top level.
  repoRoot: string;
  base?: string | undefined;
};

// Plugin version policy (plugins/AGENTS.md): every change to a plugin's shipped content needs
// exactly one version increment relative to the merge base. The check reads committed history
// only, so it judges what a push would send; the plugin linter stays free of git.
export async function checkPluginVersions(
  options: VersionCheckOptions,
): Promise<VersionCheckResult> {
  const { repoRoot } = options;
  const base = options.base ?? DEFAULT_BASE;

  // A shallow history can hide the merge base, or cut the range short while every command
  // succeeds, so the check refuses it instead of passing over an incomplete range.
  if ((await git(repoRoot, ["rev-parse", "--is-shallow-repository"])) === "true") {
    throw new Error("the repository is a shallow clone; run git fetch --unshallow and retry.");
  }
  if (
    (await tryGit(repoRoot, [
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${base}^{commit}`,
    ])) === undefined
  ) {
    throw new Error(`base ref "${base}" does not exist; fetch it or pass --base <ref>.`);
  }
  const mergeBase = await tryGit(repoRoot, ["merge-base", "--end-of-options", base, "HEAD"]);
  if (mergeBase === undefined) {
    throw new Error(`HEAD shares no history with base ref "${base}".`);
  }

  const diff = await git(repoRoot, [
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    "--no-relative",
    mergeBase,
    "HEAD",
    "--",
    // Anchored at the top level, and printed from it even under diff.relative, so the result does
    // not depend on which directory runs the check.
    ":(top)plugins/",
  ]);
  const changes = shippedChangesByPlugin(diff.split("\0").filter((entry) => entry.length > 0));

  const checkedPlugins: string[] = [];
  const violations: VersionViolation[] = [];
  for (const [plugin, changedPaths] of changes) {
    const baseVersion = await readVersion(repoRoot, mergeBase, plugin);
    const headVersion = await readVersion(repoRoot, "HEAD", plugin);
    // A plugin added or removed on the branch has no version to step from or to. A manifest that
    // is missing or unreadable while the plugin remains is the plugin linter's diagnostic.
    if (baseVersion === undefined || headVersion === undefined) {
      continue;
    }
    checkedPlugins.push(plugin);
    const allowedVersions = nextVersions(baseVersion);
    if (!allowedVersions.includes(headVersion)) {
      violations.push({ plugin, baseVersion, headVersion, allowedVersions, changedPaths });
    }
  }
  return { base, mergeBase, checkedPlugins, violations };
}

async function readVersion(
  repoRoot: string,
  revision: string,
  plugin: string,
): Promise<string | undefined> {
  const text = await tryGit(repoRoot, ["show", `${revision}:plugins/${plugin}/plugin.json`]);
  if (text === undefined) {
    return undefined;
  }
  try {
    const version: unknown = (JSON.parse(text) as { version?: unknown }).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

async function tryGit(repoRoot: string, args: string[]): Promise<string | undefined> {
  try {
    return await git(repoRoot, args);
  } catch {
    return undefined;
  }
}

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot, env: gitEnvironment() });
  return stdout.trim();
}

// A hook exports GIT_DIR and related variables to the commands it runs; dropping every inherited
// GIT_* variable makes git discover the repository from repoRoot instead.
function gitEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("GIT_")) {
      env[key] = value;
    }
  }
  return env;
}
