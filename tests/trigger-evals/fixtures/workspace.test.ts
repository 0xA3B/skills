import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  needsCaseWorkspace,
  stageCaseWorkspace,
} from "../../../src/trigger-evals/fixtures/index.js";
import { seedGitEnvironment } from "../../../src/trigger-evals/fixtures/seeds.js";
import { writeSeedFixture } from "../test-utils.js";

const execFileAsync = promisify(execFile);

// A base workspace as a lane leaves it: the harness-owned surfaces staged, nothing else.
async function writeBaseWorkspace(): Promise<{ workspaceRoot: string; workspacePath: string }> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "fixture-workspace-"));
  const workspacePath = path.join(workspaceRoot, "workspace");
  const skillPath = path.join(workspacePath, ".agents", "skills", "auto-skill");
  await mkdir(skillPath, { recursive: true });
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: auto-skill\n---\n");
  return { workspaceRoot, workspacePath };
}

// A case workspace is the case's own copy: inside the workspace root, outside the base workspace.
function expectCaseWorkspace(
  caseWorkspacePath: string,
  base: { workspaceRoot: string; workspacePath: string },
): void {
  expect(caseWorkspacePath.startsWith(base.workspaceRoot + path.sep)).toBe(true);
  expect(path.relative(base.workspacePath, caseWorkspacePath).startsWith("..")).toBe(true);
}

describe("needsCaseWorkspace", () => {
  it("copies the base workspace only for a workspace block or declared files", () => {
    const base = { id: "case", prompt: "Do it.", expect: "invoke" as const };
    expect(needsCaseWorkspace(base)).toBe(false);
    expect(needsCaseWorkspace({ ...base, workspaceFiles: {} })).toBe(false);
    expect(needsCaseWorkspace({ ...base, workspaceFiles: { "notes.md": "x" } })).toBe(true);
    expect(
      needsCaseWorkspace({
        ...base,
        workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
      }),
    ).toBe(true);
  });
});

describe("stageCaseWorkspace", () => {
  it("seeds a git repository for a case with a workspace block", async () => {
    const { workspaceRoot, workspacePath } = await writeBaseWorkspace();
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "fixture-repo-"));
    await writeSeedFixture(repoRoot, "demo-seed");

    const caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: workspacePath,
      workspaceRoot,
      repoRoot,
      testCase: {
        id: "seeded-case",
        prompt: "Anything",
        expect: "invoke",
        workspace: { seed: "demo-seed", branch: "main", committed: {}, staged: {} },
        workspaceFiles: { "notes.md": "unstaged\n" },
      },
    });

    expectCaseWorkspace(caseWorkspacePath, { workspaceRoot, workspacePath });
    await expect(stat(path.join(caseWorkspacePath, ".git"))).resolves.toBeDefined();
    await expect(
      readFile(path.join(caseWorkspacePath, "src", "index.js"), "utf8"),
    ).resolves.toContain("seed");
    await expect(readFile(path.join(caseWorkspacePath, "notes.md"), "utf8")).resolves.toBe(
      "unstaged\n",
    );
    // The harness surfaces copied from the base workspace join the seed commit, so the only
    // dirty path the agent can see is the case's unstaged workspace file.
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: caseWorkspacePath,
      env: seedGitEnvironment(),
    });
    expect(stdout.trimEnd().split("\n")).toStrictEqual(["?? notes.md"]);
  });

  it("copies the base workspace and applies fixture workspace files", async () => {
    const { workspaceRoot, workspacePath } = await writeBaseWorkspace();

    const caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: workspacePath,
      workspaceRoot,
      // A case without a workspace block reads nothing from the repository.
      repoRoot: await mkdtemp(path.join(os.tmpdir(), "fixture-repo-")),
      testCase: {
        id: "agents-case",
        prompt: "Anything",
        expect: "skip",
        workspaceFiles: { "AGENTS.md": "Use Gitmoji.\n" },
      },
    });

    expectCaseWorkspace(caseWorkspacePath, { workspaceRoot, workspacePath });
    await expect(readFile(path.join(caseWorkspacePath, "AGENTS.md"), "utf8")).resolves.toBe(
      "Use Gitmoji.\n",
    );
    await expect(
      readFile(path.join(caseWorkspacePath, ".agents", "skills", "auto-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("auto-skill");
  });

  it("gives each case its own copy of the base workspace", async () => {
    const { workspaceRoot, workspacePath } = await writeBaseWorkspace();
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "fixture-repo-"));
    const stage = async (id: string, workspaceFiles: Record<string, string>) =>
      stageCaseWorkspace({
        baseWorkspacePath: workspacePath,
        workspaceRoot,
        repoRoot,
        testCase: { id, prompt: "Anything", expect: "skip", workspaceFiles },
      });

    const firstPath = await stage("first-case", { "first.md": "first\n" });
    const secondPath = await stage("second-case", { "second.md": "second\n" });

    expect(secondPath).not.toBe(firstPath);
    await expect(stat(path.join(secondPath, "first.md"))).rejects.toThrow(/ENOENT/);
  });
});
