import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// A hook exports GIT_DIR and friends to the commands it runs; an inherited one would point the
// fixture commands at the repository running the tests. User and system config are disabled so
// the fixture never depends on the machine's git configuration.
export function fixtureGitEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("GIT_")) {
      env[key] = value;
    }
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Range Check",
    GIT_AUTHOR_EMAIL: "range-check@example.invalid",
    GIT_COMMITTER_NAME: "Range Check",
    GIT_COMMITTER_EMAIL: "range-check@example.invalid",
  };
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, env: fixtureGitEnvironment() });
  return stdout.trimEnd();
}

// A fresh repository on main inside its own temporary directory, removed afterwards.
export async function withTempRepo<T>(callback: (repoRoot: string) => Promise<T>): Promise<T> {
  const parent = await mkdtemp(path.join(tmpdir(), "range-check-test-"));
  const repoRoot = path.join(parent, "repo");
  try {
    await git(parent, "init", "--quiet", "--initial-branch=main", repoRoot);
    return await callback(repoRoot);
  } finally {
    await rm(parent, { force: true, recursive: true });
  }
}

export async function writeFiles(repoRoot: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
}

export async function commitFiles(
  repoRoot: string,
  message: string,
  files: Record<string, string>,
): Promise<string> {
  await writeFiles(repoRoot, files);
  await git(repoRoot, "add", "--all");
  await git(repoRoot, "commit", "--quiet", "--allow-empty", "--message", message);
  return git(repoRoot, "rev-parse", "HEAD");
}

// The remote-tracking ref the range checks default to, without a real remote.
export async function setOriginMain(repoRoot: string, commit: string): Promise<void> {
  await git(repoRoot, "update-ref", "refs/remotes/origin/main", commit);
}
