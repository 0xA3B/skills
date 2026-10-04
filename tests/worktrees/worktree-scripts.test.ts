import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, realpath } from "node:fs/promises";
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

async function runScript(name: string, args: string[], options: { cwd: string; bin: string }) {
  const env = fixtureGitEnvironment();
  try {
    const { stdout, stderr } = await execFileAsync(path.join(scripts, name), args, {
      cwd: options.cwd,
      env: { ...env, PATH: `${options.bin}${path.delimiter}${env["PATH"] ?? ""}` },
    });
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
