import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  commitFiles,
  fixtureGitEnvironment,
  git,
  withTempRepo,
  writeFiles,
} from "../git-fixtures.js";

const execFileAsync = promisify(execFile);
const scripts = path.resolve(import.meta.dirname, "../../scripts");

// pnpm is the one external tool the scripts run; the stub records each install's arguments and
// writes to stdout the way a real install does.
async function stubPnpm(): Promise<{ bin: string; log: string }> {
  const bin = await mkdtemp(path.join(tmpdir(), "stub-bin-"));
  const log = path.join(bin, "pnpm.log");
  await writeFiles(bin, {
    pnpm: `#!/bin/sh\nprintf '%s\\n' "$*" >>"${log}"\necho "Lockfile is up to date"\n`,
  });
  await chmod(path.join(bin, "pnpm"), 0o755);
  return { bin, log };
}

async function runScript(
  name: string,
  args: string[],
  options: { cwd: string; bin: string; input?: string },
) {
  const env = fixtureGitEnvironment();
  try {
    const running = execFileAsync(path.join(scripts, name), args, {
      cwd: options.cwd,
      env: { ...env, PATH: `${options.bin}${path.delimiter}${env["PATH"] ?? ""}` },
    });
    running.child.stdin?.end(options.input ?? "");
    const { stdout, stderr } = await running;
    return { exitCode: 0, stdout, stderr };
  } catch (caught: unknown) {
    const failure = caught as { code: number; stdout: string; stderr: string };
    return { exitCode: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

describe("scripts/worktree-add", () => {
  it("creates the worktree under .claude/worktrees, naming its directory after the whole branch", async () => {
    await withTempRepo(async (repoRoot) => {
      const main = await commitFiles(repoRoot, "chore: seed", { "README.md": "seed\n" });
      const pnpm = await stubPnpm();

      const { exitCode, stdout } = await runScript("worktree-add", ["feat/login-form"], {
        cwd: repoRoot,
        bin: pnpm.bin,
      });

      const dir = path.join(await realpath(repoRoot), ".claude/worktrees/feat+login-form");
      expect(exitCode).toBe(0);
      expect(stdout.trimEnd().split("\n").at(-1)).toBe(dir);
      expect(await git(dir, "symbolic-ref", "--short", "HEAD")).toBe("feat/login-form");
      expect(await git(dir, "rev-parse", "HEAD")).toBe(main);
      expect(await readFile(pnpm.log, "utf8")).toBe(
        `--dir ${dir} install --frozen-lockfile --prefer-offline\n`,
      );
    });
  });

  it("gives a slash-separated branch and its hyphenated twin separate worktrees", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", { "README.md": "seed\n" });
      const pnpm = await stubPnpm();

      const slashed = await runScript("worktree-add", ["feat/login-form"], {
        cwd: repoRoot,
        bin: pnpm.bin,
      });
      const hyphenated = await runScript("worktree-add", ["feat-login-form"], {
        cwd: repoRoot,
        bin: pnpm.bin,
      });

      expect(slashed.exitCode).toBe(0);
      expect(hyphenated.exitCode).toBe(0);
      const worktrees = path.join(await realpath(repoRoot), ".claude/worktrees");
      expect(await git(path.join(worktrees, "feat+login-form"), "branch", "--show-current")).toBe(
        "feat/login-form",
      );
      expect(await git(path.join(worktrees, "feat-login-form"), "branch", "--show-current")).toBe(
        "feat-login-form",
      );
    });
  });
});

// A clone of an upstream repository, whose origin/main the hook fetches.
async function withClone<T>(callback: (clone: string, upstream: string) => Promise<T>): Promise<T> {
  return withTempRepo(async (upstream) => {
    await commitFiles(upstream, "chore: seed", { "README.md": "seed\n" });
    const clone = path.join(path.dirname(upstream), "clone");
    await git(path.dirname(upstream), "clone", "--quiet", upstream, clone);
    return callback(clone, upstream);
  });
}

describe("scripts/claude-worktree-hook create", () => {
  it("branches the named worktree from freshly fetched origin/main and prints only its path", async () => {
    await withClone(async (clone, upstream) => {
      const upstreamMain = await commitFiles(upstream, "feat: upstream", { "NEW.md": "new\n" });
      const pnpm = await stubPnpm();

      const { exitCode, stdout } = await runScript("claude-worktree-hook", ["create"], {
        cwd: clone,
        bin: pnpm.bin,
        input: JSON.stringify({ hook_event_name: "WorktreeCreate", name: "feat/login-form" }),
      });

      const dir = path.join(await realpath(clone), ".claude/worktrees/feat+login-form");
      expect(exitCode).toBe(0);
      expect(stdout).toBe(`${dir}\n`);
      expect(await git(dir, "symbolic-ref", "--short", "HEAD")).toBe("feat/login-form");
      expect(await git(dir, "rev-parse", "HEAD")).toBe(upstreamMain);
      // Tracking origin/main would make git push and git status compare the branch with main.
      expect(
        await git(dir, "for-each-ref", "--format=%(upstream)", "refs/heads/feat/login-form"),
      ).toBe("");
    });
  });

  it("refuses a name that starts with -, which no branch name can", async () => {
    await withClone(async (clone) => {
      const pnpm = await stubPnpm();

      const { exitCode, stdout, stderr } = await runScript("claude-worktree-hook", ["create"], {
        cwd: clone,
        bin: pnpm.bin,
        input: JSON.stringify({ name: "--help" }),
      });

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("--help");
      expect(existsSync(path.join(clone, ".claude/worktrees"))).toBe(false);
    });
  });
});

// The feat/login-form worktree a setup run created. A failed run leaves no worktree, and a test
// that then wrote into it would write into the checkout running the tests, so the run must pass.
async function loginFormWorktree(repo: string, run: { exitCode: number }): Promise<string> {
  expect(run.exitCode).toBe(0);
  return path.join(await realpath(repo), ".claude/worktrees/feat+login-form");
}

async function localBranches(repo: string): Promise<string[]> {
  return (await git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads")).split("\n");
}

describe("scripts/claude-worktree-hook remove", () => {
  // A worktree the create hook made, as Claude Code's later WorktreeRemove call finds it.
  async function createWorktree(clone: string, bin: string): Promise<string> {
    const created = await runScript("claude-worktree-hook", ["create"], {
      cwd: clone,
      bin,
      input: JSON.stringify({ name: "feat/login-form" }),
    });
    return loginFormWorktree(clone, created);
  }

  async function removeWorktree(dir: string, bin: string) {
    return runScript("claude-worktree-hook", ["remove"], {
      cwd: dir,
      bin,
      input: JSON.stringify({ hook_event_name: "WorktreeRemove", worktree_path: dir }),
    });
  }

  it("removes a worktree with uncommitted changes and deletes its branch that origin/main contains", async () => {
    await withClone(async (clone, upstream) => {
      // Local main lags origin/main, so only origin/main contains the new branch's base.
      await commitFiles(upstream, "feat: upstream", { "NEW.md": "new\n" });
      const pnpm = await stubPnpm();
      const dir = await createWorktree(clone, pnpm.bin);
      await writeFiles(dir, { "README.md": "edited\n" });

      const { exitCode } = await removeWorktree(dir, pnpm.bin);

      expect(exitCode).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(await localBranches(clone)).toStrictEqual(["main"]);
    });
  });

  it("keeps a branch with commits neither main nor origin/main contains", async () => {
    await withClone(async (clone) => {
      const pnpm = await stubPnpm();
      const dir = await createWorktree(clone, pnpm.bin);
      await commitFiles(dir, "feat: unmerged", { "LOGIN.md": "login\n" });

      const { exitCode, stdout } = await removeWorktree(dir, pnpm.bin);

      expect(exitCode).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(await localBranches(clone)).toStrictEqual(["feat/login-form", "main"]);
      expect(stdout).toContain("kept branch feat/login-form");
    });
  });

  it("removes a worktree whose HEAD is detached", async () => {
    await withClone(async (clone) => {
      const pnpm = await stubPnpm();
      const dir = await createWorktree(clone, pnpm.bin);
      await git(dir, "checkout", "--quiet", "--detach");

      const { exitCode } = await removeWorktree(dir, pnpm.bin);

      expect(exitCode).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(await git(clone, "worktree", "list", "--porcelain")).not.toContain(dir);
    });
  });

  it("keeps a detached worktree whose HEAD has commits no ref contains", async () => {
    await withClone(async (clone) => {
      const pnpm = await stubPnpm();
      const dir = await createWorktree(clone, pnpm.bin);
      await git(dir, "checkout", "--quiet", "--detach");
      const orphan = await commitFiles(dir, "feat: detached work", { "LOGIN.md": "login\n" });

      const { exitCode, stderr } = await removeWorktree(dir, pnpm.bin);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("no branch, remote branch, or tag contains");
      expect(await git(dir, "rev-parse", "HEAD")).toBe(orphan);
    });
  });
});

describe("scripts/worktree-remove", () => {
  async function withIgnoredLocalWorktree<T>(
    callback: (repoRoot: string, dir: string, bin: string) => Promise<T>,
  ): Promise<T> {
    return withTempRepo(async (repoRoot) => {
      // The repository ignores these paths itself or through each user's global excludes.
      await commitFiles(repoRoot, "chore: seed", {
        ".gitignore": ".local/\nnode_modules/\n.husky/_/\n**/.claude/.cc-writes/\n",
        "plugins/demo/README.md": "demo\n",
      });
      const pnpm = await stubPnpm();
      const added = await runScript("worktree-add", ["feat/login-form"], {
        cwd: repoRoot,
        bin: pnpm.bin,
      });
      return callback(repoRoot, await loginFormWorktree(repoRoot, added), pnpm.bin);
    });
  }

  it("removes a worktree whose ignored paths are only empty directories, install output, and write tracking", async () => {
    await withIgnoredLocalWorktree(async (repoRoot, dir, bin) => {
      await mkdir(path.join(dir, ".local/scratch"), { recursive: true });
      await writeFiles(dir, {
        "node_modules/demo/index.js": "\n",
        ".husky/_/pre-commit": "\n",
        ".claude/.cc-writes/root": "\n",
        // A shell that ran in a tracked subdirectory leaves the write tracking there.
        "plugins/demo/.claude/.cc-writes/nested": "\n",
      });

      const { exitCode, stderr } = await runScript("worktree-remove", ["feat/login-form"], {
        cwd: repoRoot,
        bin,
      });

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(await localBranches(repoRoot)).toStrictEqual(["main"]);
    });
  });

  it("keeps a worktree holding ignored files unless forced", async () => {
    await withIgnoredLocalWorktree(async (repoRoot, dir, bin) => {
      await writeFiles(dir, { ".local/notes.md": "notes\n" });

      const { exitCode, stderr } = await runScript("worktree-remove", ["feat/login-form"], {
        cwd: repoRoot,
        bin,
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("holds ignored files");
      expect(stderr).toContain("  .local/");
      expect(existsSync(dir)).toBe(true);
    });
  });
});
