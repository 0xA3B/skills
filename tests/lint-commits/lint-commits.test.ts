import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  commitFiles,
  fixtureGitEnvironment,
  git,
  setOriginMain,
  withTempRepo,
  writeFiles,
} from "../git-fixtures.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const script = path.join(repositoryRoot, "scripts", "lint-commits");

async function lintCommits(cwd: string, ...args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(script, args, {
      cwd,
      env: fixtureGitEnvironment(),
    });
    return { exitCode: 0, stdout, stderr };
  } catch (caught: unknown) {
    const failure = caught as { code: number; stdout: string; stderr: string };
    return { exitCode: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

// commitlint reads its rules from the repository it runs in and resolves the shared config from
// node_modules, so the fixture carries this repository's config and dependencies.
async function withCommitlintRepo<T>(callback: (repoRoot: string) => Promise<T>): Promise<T> {
  return withTempRepo(async (repoRoot) => {
    await writeFiles(repoRoot, {
      "package.json": `${JSON.stringify({ commitlint: { extends: ["@commitlint/config-conventional"] } })}\n`,
      ".gitignore": "node_modules\n",
    });
    await symlink(path.join(repositoryRoot, "node_modules"), path.join(repoRoot, "node_modules"));
    return callback(repoRoot);
  });
}

describe("scripts/lint-commits", () => {
  it("passes an empty range without running commitlint", async () => {
    await withTempRepo(async (repoRoot) => {
      await setOriginMain(repoRoot, await commitFiles(repoRoot, "chore: seed", {}));

      const { exitCode, stdout } = await lintCommits(repoRoot);

      expect(exitCode).toBe(0);
      expect(stdout).toBe("Commit lint: no commits since the merge base with origin/main.\n");
    });
  });

  it("lints the commits since the merge base and fails on a bad message", async () => {
    await withCommitlintRepo(async (repoRoot) => {
      await setOriginMain(repoRoot, await commitFiles(repoRoot, "chore: seed", {}));
      await commitFiles(repoRoot, "feat: good", {});
      await commitFiles(repoRoot, "Bad message", {});

      const { exitCode, stdout } = await lintCommits(repoRoot);

      expect(exitCode).not.toBe(0);
      expect(stdout).toContain("Bad message");
      expect(stdout).not.toContain("chore: seed");
    });
  });

  it("ignores commits before the merge base", async () => {
    await withCommitlintRepo(async (repoRoot) => {
      // The bad commit is not the root commit, so a range that starts too early would reach it.
      await commitFiles(repoRoot, "chore: seed", {});
      await setOriginMain(repoRoot, await commitFiles(repoRoot, "Bad base message", {}));
      await commitFiles(repoRoot, "feat: good", {});

      const { exitCode } = await lintCommits(repoRoot);

      expect(exitCode).toBe(0);
    });
  });

  it("compares against --base", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", {});

      const { exitCode, stdout } = await lintCommits(repoRoot, "--base", "HEAD");

      expect(exitCode).toBe(0);
      expect(stdout).toBe("Commit lint: no commits since the merge base with HEAD.\n");
    });
  });

  it("refuses a missing base and names the override", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", {});

      const { exitCode, stderr } = await lintCommits(repoRoot);

      expect(exitCode).toBe(1);
      expect(stderr).toBe(
        'Commit lint could not run: base ref "origin/main" does not exist; fetch it or pass --base <ref>.\n',
      );
    });
  });

  it("refuses a base that shares no history with HEAD", async () => {
    await withTempRepo(async (repoRoot) => {
      await setOriginMain(repoRoot, await commitFiles(repoRoot, "chore: seed", {}));
      await git(repoRoot, "switch", "--quiet", "--orphan", "unrelated");
      await commitFiles(repoRoot, "chore: unrelated", {});

      const { exitCode, stderr } = await lintCommits(repoRoot);

      expect(exitCode).toBe(1);
      expect(stderr).toBe(
        'Commit lint could not run: HEAD shares no history with base ref "origin/main".\n',
      );
    });
  });

  // A shallow history can cut the range short while every git command succeeds.
  it("refuses a shallow clone", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", {});
      await commitFiles(repoRoot, "feat: one", {});
      const clone = await mkdtemp(path.join(tmpdir(), "lint-commits-shallow-"));
      try {
        await git(clone, "clone", "--quiet", "--depth=1", `file://${repoRoot}`, "repo");
        const cloneRoot = path.join(clone, "repo");

        const { exitCode, stderr } = await lintCommits(cloneRoot);

        expect(exitCode).toBe(1);
        expect(stderr).toBe(
          "Commit lint could not run: the repository is a shallow clone; run git fetch --unshallow and retry.\n",
        );
      } finally {
        await rm(clone, { force: true, recursive: true });
      }
    });
  });
});
