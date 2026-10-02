import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// The git checkout that supplies a run's staged skills, so a report names the code it measured.
export type Checkout = {
  root: string;
  // Undefined on a detached HEAD.
  branch?: string;
  // The abbreviated HEAD commit.
  head: string;
  // Tracked files with changes plus untracked files: staging copies the working tree, so these
  // are part of what the run measured.
  uncommittedFiles: number;
};

// Reads the checkout at root. Fails when root is not a git checkout, because a run whose code
// cannot be named is not one a report can trust.
export async function readCheckout(root: string): Promise<Checkout> {
  try {
    const [branch, head, status] = await Promise.all([
      git(root, "branch", "--show-current"),
      git(root, "rev-parse", "--short", "HEAD"),
      git(root, "status", "--porcelain", "--untracked-files=all"),
    ]);
    const uncommittedFiles = status.split("\n").filter((line) => line.length > 0).length;
    return { root, ...(branch === "" ? {} : { branch }), head, uncommittedFiles };
  } catch (caught) {
    throw new Error(
      `cannot read the git checkout at ${root}: ${caught instanceof Error ? caught.message : String(caught)}`,
      { cause: caught },
    );
  }
}

export function formatCheckout(checkout: Checkout): string {
  const ref =
    checkout.branch === undefined
      ? `at ${checkout.head} (detached HEAD)`
      : `on ${checkout.branch} at ${checkout.head}`;
  const files = `${checkout.uncommittedFiles} uncommitted file${checkout.uncommittedFiles === 1 ? "" : "s"}`;
  return `Checkout: ${checkout.root} ${ref}, ${files}.`;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trimEnd();
}
