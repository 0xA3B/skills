import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { readCheckout } from "../../src/trigger-evals/checkout.js";
import { seedGitEnvironment } from "../../src/trigger-evals/fixtures/seeds.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, env: seedGitEnvironment() });
  return stdout.trim();
}

// A repository on branch feature/x with one commit.
async function writeRepository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "checkout-"));
  await git(root, "init", "--quiet", "--initial-branch", "feature/x");
  await writeFile(path.join(root, "tracked.md"), "one\n");
  await git(root, "add", "tracked.md");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "initial");
  return root;
}

describe("readCheckout", () => {
  it("names the root, branch, short HEAD, and uncommitted files of the checkout", async () => {
    const root = await writeRepository();
    // One modified tracked file and two untracked files inside a new directory, each counted.
    await writeFile(path.join(root, "tracked.md"), "two\n");
    await mkdir(path.join(root, "notes"));
    await writeFile(path.join(root, "notes", "draft.md"), "draft\n");
    await writeFile(path.join(root, "notes", "todo.md"), "todo\n");

    expect(await readCheckout(root)).toStrictEqual({
      root,
      branch: "feature/x",
      head: await git(root, "rev-parse", "--short", "HEAD"),
      uncommittedFiles: 3,
    });
  });

  it("reads the checkout at root even under a hook's inherited GIT_DIR", async () => {
    const root = await writeRepository();
    const other = await writeRepository();
    await git(other, "checkout", "--quiet", "-b", "other-branch");
    vi.stubEnv("GIT_DIR", path.join(other, ".git"));
    try {
      expect((await readCheckout(root)).branch).toBe("feature/x");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("leaves the branch out on a detached HEAD", async () => {
    const root = await writeRepository();
    await git(root, "checkout", "--quiet", "--detach");

    const checkout = await readCheckout(root);

    expect(checkout.branch).toBeUndefined();
    expect(checkout.uncommittedFiles).toBe(0);
  });

  it("refuses a directory that is not a git checkout", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "not-a-checkout-"));

    await expect(readCheckout(root)).rejects.toThrow(`cannot read the git checkout at ${root}`);
  });
});
