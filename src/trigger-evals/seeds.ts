import { execFile } from "node:child_process";
import { cp, lstat, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { WorkspaceSpec } from "./types.js";

const execFileAsync = promisify(execFile);

// Workspace seeds are committed project content under evals/seeds/<name>/, copied verbatim into a
// case workspace and turned into a git repository before the agent runs.
export const SEEDS_DIR = path.join("evals", "seeds");

export function resolveSeedPath(repoRoot: string, seedName: string): string {
  return path.join(repoRoot, SEEDS_DIR, seedName);
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
  // A seed shipping its own .git, as a directory or a gitfile pointing elsewhere, would be reused
  // by git init, carrying hooks and config into the case or redirecting the seed commands to
  // another repository; seeds are plain project content and the harness owns the repository.
  if (await exists(path.join(seedPath, ".git"))) {
    throw new Error(`workspace seed "${workspace.seed}" must not contain a .git entry.`);
  }

  await mkdir(workspacePath, { recursive: true });
  // The lane wrote its skills and settings under .agents and .claude in the base workspace; a
  // seed's own entries there are left out of the copy so they cannot overwrite those surfaces.
  // Symlinks are copied verbatim: the default resolves a relative link into an absolute path back
  // into the source seed, and a later layer written through it would edit the shared seed.
  await cp(seedPath, workspacePath, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) =>
      !SEED_EXCLUDED_ENTRIES.has(path.relative(seedPath, source).split(path.sep)[0] ?? ""),
  });
  await writeWorkspaceFiles(workspacePath, workspace.committed);
  await git(workspacePath, "init", "--quiet", "--initial-branch", workspace.branch);
  await git(workspacePath, "add", "--all");
  // A seed's own .gitignore shapes what the seed commits, but never the fixture's declared layers:
  // an unforced add would silently drop a committed or staged file the seed ignores.
  await addForced(workspacePath, workspace.committed);
  await git(workspacePath, "-c", "commit.gpgsign=false", "commit", "--quiet", "--message", "Seed");
  await writeWorkspaceFiles(workspacePath, workspace.staged);
  await addForced(workspacePath, workspace.staged);
  await writeWorkspaceFiles(workspacePath, options.workspaceFiles ?? {});
}

const SEED_EXCLUDED_ENTRIES = new Set([".agents", ".claude"]);

async function addForced(workspacePath: string, files: Record<string, string>): Promise<void> {
  const paths = Object.keys(files);
  if (paths.length > 0) {
    await git(workspacePath, "add", "--force", "--", ...paths);
  }
}

export async function writeWorkspaceFiles(
  workspacePath: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativeFilePath, content] of Object.entries(files)) {
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}
