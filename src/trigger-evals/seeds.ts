import { execFile } from "node:child_process";
import { cp, lstat, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { WorkspaceSpec } from "./types.js";

const execFileAsync = promisify(execFile);

// Workspace seeds are committed project content under evals/seeds/<name>/, copied verbatim into a
// case workspace and turned into a git repository before the agent runs.
export const SEEDS_DIR = path.join("evals", "seeds");

// A seed name is one kebab-case directory name, so it can never leave SEEDS_DIR.
export const SEED_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function resolveSeedPath(repoRoot: string, seedName: string): string {
  if (!SEED_NAME_PATTERN.test(seedName)) {
    throw new Error(`workspace seed name "${seedName}" is not a kebab-case seed name.`);
  }
  return path.join(repoRoot, SEEDS_DIR, seedName);
}

// Top-level workspace entries the lane writes before any case runs: staged skills and settings.
// A seed's copies are left out, fixture paths under them are rejected, and the lane's own copies
// are force-added to the seed commit.
const HARNESS_OWNED_ENTRIES = new Set([".agents", ".claude"]);

// Safe means a POSIX-style relative file path inside the workspace and outside the harness-owned
// entries: a path reaching any .git entry could plant a hook or config that git would run or honor
// while the seed is committed, or turn a subdirectory into an embedded repository, and a path under
// .agents or .claude would overwrite the lane's staged skills and settings after the base workspace
// was copied. The .git match follows git's own rule: case-insensitive, at any depth, after dropping
// empty and "." segments. Backslashes are rejected rather than treated as separators because the
// write joins the path as written, and a trailing separator names a directory, not a file.
export function isSafeWorkspaceFilePath(filePath: string): boolean {
  const segments = filePath.split("/").filter((segment) => segment !== "" && segment !== ".");
  return (
    segments.length > 0 &&
    !filePath.includes("\0") &&
    !filePath.includes("\\") &&
    !filePath.endsWith("/") &&
    !path.isAbsolute(filePath) &&
    !segments.includes("..") &&
    !segments.some((segment) => segment.toLowerCase() === ".git") &&
    !HARNESS_OWNED_ENTRIES.has(segments[0]?.toLowerCase() ?? "")
  );
}

export const SEED_GIT_IDENTITY = { name: "Trigger Eval", email: "trigger-eval@example.invalid" };

// The harness owns the git identity and disables signing and every user-level config, so a run
// never depends on the machine's git configuration. Inherited GIT_* variables (GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, ...) are dropped first: any of them would redirect the seed
// commands away from the case workspace. The global ignore and attributes files have default
// locations under ~/.config/git that GIT_CONFIG_GLOBAL does not cover, so both are pointed at
// /dev/null through the environment config entries.
export function seedGitEnvironment(
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && !key.startsWith("GIT_")) {
      env[key] = value;
    }
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "core.excludesFile",
    GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "core.attributesFile",
    GIT_CONFIG_VALUE_1: "/dev/null",
    GIT_AUTHOR_NAME: SEED_GIT_IDENTITY.name,
    GIT_AUTHOR_EMAIL: SEED_GIT_IDENTITY.email,
    GIT_COMMITTER_NAME: SEED_GIT_IDENTITY.name,
    GIT_COMMITTER_EMAIL: SEED_GIT_IDENTITY.email,
  };
}

export type StageSeededWorkspaceOptions = {
  repoRoot: string;
  workspacePath: string;
  workspace: WorkspaceSpec;
  workspaceFiles?: Record<string, string>;
};

// Layers, in order: seed copy plus committed files in the single commit (together with any
// harness surfaces already in the workspace), staged files in the index, workspace files unstaged.
export async function stageSeededWorkspace(options: StageSeededWorkspaceOptions): Promise<void> {
  const { workspacePath, workspace } = options;
  const seedPath = resolveSeedPath(options.repoRoot, workspace.seed);
  if (!(await isDirectory(seedPath))) {
    throw new Error(`workspace seed "${workspace.seed}" not found at ${seedPath}.`);
  }
  // The root is checked with lstat because stat follows a symlinked seed directory, and the walk
  // below only sees the entries beneath it.
  if ((await lstat(seedPath)).isSymbolicLink()) {
    throw new Error(`workspace seed "${workspace.seed}" must not be a symlink.`);
  }
  await rejectUnsupportedSeedEntries(seedPath, workspace.seed);

  await mkdir(workspacePath, { recursive: true });
  // The lane wrote its skills and settings under .agents and .claude in the base workspace; a
  // seed's own entries there are left out of the copy so they cannot overwrite those surfaces.
  // The match is case-insensitive because the workspace may sit on a case-insensitive filesystem.
  await cp(seedPath, workspacePath, {
    recursive: true,
    filter: (source) =>
      !HARNESS_OWNED_ENTRIES.has(
        (path.relative(seedPath, source).split(path.sep)[0] ?? "").toLowerCase(),
      ),
  });
  await git(workspacePath, "init", "--quiet", "--initial-branch", workspace.branch);
  // The seed is added before the committed layer is written, so a committed .gitignore cannot
  // hide the seed from its own commit. A seed's own .gitignore shapes what the seed commits, but
  // never the fixture's declared layers or the lane's surfaces: an unforced add would silently
  // drop a file the seed ignores.
  await git(workspacePath, "add", "--all");
  await writeWorkspaceFiles(workspacePath, workspace.committed);
  await addForced(workspacePath, Object.keys(workspace.committed));
  await addForced(workspacePath, await presentHarnessEntries(workspacePath));
  // --allow-empty keeps the one-commit contract when a seed's .gitignore leaves nothing to commit.
  await git(
    workspacePath,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "Seed",
  );
  await writeWorkspaceFiles(workspacePath, workspace.staged);
  await addForced(workspacePath, Object.keys(workspace.staged));
  await writeWorkspaceFiles(workspacePath, options.workspaceFiles ?? {});
  // Unstaged files stay untracked, so an ignored path would be invisible to git status and diff
  // and the case would run against a clean-looking tree; the fixture must use another path. The
  // check runs after the write so a .gitignore in this layer counts too.
  const ignored = await ignoredPaths(workspacePath, Object.keys(options.workspaceFiles ?? {}));
  if (ignored.length > 0) {
    throw new Error(
      `workspace_files ${ignored.map((entry) => JSON.stringify(entry)).join(", ")} would be ignored in the seeded workspace; place unstaged files where git status shows them.`,
    );
  }
}

async function presentHarnessEntries(workspacePath: string): Promise<string[]> {
  const present: string[] = [];
  for (const entry of HARNESS_OWNED_ENTRIES) {
    if (await isDirectory(path.join(workspacePath, entry))) {
      present.push(entry);
    }
  }
  return present;
}

// check-ignore takes literal pathnames, so no pathspec handling is needed here.
async function ignoredPaths(workspacePath: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) {
    return [];
  }
  try {
    const { stdout } = await execFileAsync("git", ["check-ignore", "--", ...paths], {
      cwd: workspacePath,
      env: seedGitEnvironment(),
    });
    return stdout.split("\n").filter((line) => line.length > 0);
  } catch (error) {
    // Exit status 1 means no path is ignored.
    if (isExecError(error) && error.code === 1) {
      return [];
    }
    throw error;
  }
}

function isExecError(error: unknown): error is { code: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "number"
  );
}

// Seeds are plain project content and the harness owns the repository. A .git entry at any depth
// breaks that: at the root, a directory or a gitfile pointing elsewhere would be reused by git
// init, carrying hooks and config into the case or redirecting the seed commands to another
// repository; nested, it makes git add fail or stage a gitlink instead of the files. A symlink is
// rejected because a fixture layer written through it could reach the shared seed, a harness
// surface, or a path outside the case workspace.
async function rejectUnsupportedSeedEntries(seedPath: string, seedName: string): Promise<void> {
  for (const entry of await readdir(seedPath, { withFileTypes: true, recursive: true })) {
    const relativePath = path.relative(seedPath, path.join(entry.parentPath, entry.name));
    if (entry.name.toLowerCase() === ".git") {
      throw new Error(
        `workspace seed "${seedName}" must not contain a .git entry (${relativePath}).`,
      );
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`workspace seed "${seedName}" must not contain a symlink (${relativePath}).`);
    }
  }
}

// Declared filenames are literal paths, never pathspec patterns: a leading ":" or a glob character
// in a filename would otherwise be read as pathspec magic.
async function addForced(workspacePath: string, paths: string[]): Promise<void> {
  if (paths.length > 0) {
    await git(workspacePath, "--literal-pathspecs", "add", "--force", "--", ...paths);
  }
}

// The fixture loader reports unsafe paths with fixture diagnostics; the check is repeated here so
// a programmatic caller cannot write outside the workspace or into a harness-owned entry.
export async function writeWorkspaceFiles(
  workspacePath: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativeFilePath, content] of Object.entries(files)) {
    if (!isSafeWorkspaceFilePath(relativeFilePath)) {
      throw new Error(
        `workspace file path "${relativeFilePath}" is not a safe relative path outside .git, .agents, and .claude.`,
      );
    }
    const absoluteFilePath = path.join(workspacePath, relativeFilePath);
    await mkdir(path.dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, content);
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd, env: seedGitEnvironment() });
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}
