import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceSpec } from "../../../src/trigger-evals/fixtures/fixture.js";
import {
  resolveSeedPath,
  SEED_GIT_IDENTITY,
  seedGitEnvironment,
  stageSeededWorkspace,
  writeWorkspaceFiles,
} from "../../../src/trigger-evals/fixtures/seeds.js";
import { writeSeedFixture } from "../test-utils.js";

const execFileAsync = promisify(execFile);

// The assertions run git with the harness environment too: a hook exports an absolute GIT_DIR to
// the commands it runs, and an inherited one would point every assertion at the parent repository.
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, env: seedGitEnvironment() });
  return stdout.trimEnd();
}

describe("resolveSeedPath", () => {
  it("locates seeds under evals/seeds/<name> in the repository", () => {
    expect(resolveSeedPath("/repo", "node-service")).toBe(
      path.join("/repo", "evals", "seeds", "node-service"),
    );
  });

  it.each(["../..", "a/b", "", "Node-Service"])("rejects the seed name %s", (seedName) => {
    expect(() => resolveSeedPath("/repo", seedName)).toThrow("is not a kebab-case seed name");
  });
});

describe("writeWorkspaceFiles", () => {
  it("rejects unsafe paths from programmatic callers", async () => {
    const workspacePath = await mkdtemp(path.join(os.tmpdir(), "seed-ws-"));

    await expect(writeWorkspaceFiles(workspacePath, { "../escape.md": "x" })).rejects.toThrow(
      'workspace file path "../escape.md" is not a safe relative path',
    );
    await expect(
      writeWorkspaceFiles(workspacePath, { ".claude/settings.json": "x" }),
    ).rejects.toThrow("is not a safe relative path");
  });
});

type StageSeedOptions = {
  // Files added to the node-service seed beside writeSeedFixture's package.json and src/index.js.
  seedFiles?: Record<string, string>;
  // Writes an entry into the seed that a file map cannot express, such as a symlink.
  prepareSeed?: (seedPath: string) => Promise<unknown>;
  // Files already in the workspace before seeding, as the lane leaves its harness surfaces.
  baseFiles?: Record<string, string>;
  // Merged over the default block: the node-service seed on main with no committed or staged files.
  workspace?: Partial<WorkspaceSpec>;
  workspaceFiles?: Record<string, string>;
};

// Stages a seeded workspace from a fresh repository and workspace, so each test states only the
// inputs it is about. Returns the workspace path.
async function stageSeed(options: StageSeedOptions = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
  await writeSeedFixture(repoRoot, "node-service");
  const seedPath = resolveSeedPath(repoRoot, "node-service");
  await writeFiles(seedPath, options.seedFiles ?? {});
  await options.prepareSeed?.(seedPath);
  const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");
  await writeFiles(workspacePath, options.baseFiles ?? {});

  await stageSeededWorkspace({
    repoRoot,
    workspacePath,
    workspace: {
      seed: "node-service",
      branch: "main",
      committed: {},
      staged: {},
      ...options.workspace,
    },
    ...(options.workspaceFiles === undefined ? {} : { workspaceFiles: options.workspaceFiles }),
  });
  return workspacePath;
}

// Unlike writeWorkspaceFiles, writes anywhere, including the harness-owned entries.
async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
    await writeFile(path.join(root, relativePath), content);
  }
}

async function trackedFiles(workspacePath: string): Promise<string[]> {
  return (await git(workspacePath, "ls-tree", "-r", "--name-only", "HEAD")).split("\n").sort();
}

describe("stageSeededWorkspace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Spec: "Every seed is a git repository: git init -b <branch>, no remote, one commit of seed +
  // committed files, then staged files written and git added, then workspace_files written
  // unstaged."
  it("stages the seed as a one-commit repository with staged and unstaged layers", async () => {
    const workspacePath = await stageSeed({
      baseFiles: { ".claude/settings.json": "{}\n" },
      workspace: {
        branch: "feature/retry",
        committed: { "AGENTS.md": "Use Conventional Commits.\n" },
        staged: { "src/retry.js": "export function retry() {}\n" },
      },
      workspaceFiles: { "src/index.js": "export const seed = false;\n" },
    });

    expect(await git(workspacePath, "branch", "--show-current")).toBe("feature/retry");
    expect(await git(workspacePath, "rev-list", "--count", "HEAD")).toBe("1");
    expect(await git(workspacePath, "remote")).toBe("");
    // The commit holds the seed, the committed files, and the harness surfaces already present.
    expect(await trackedFiles(workspacePath)).toStrictEqual([
      ".claude/settings.json",
      "AGENTS.md",
      "package.json",
      "src/index.js",
    ]);
    expect((await git(workspacePath, "status", "--porcelain")).split("\n")).toStrictEqual([
      " M src/index.js",
      "A  src/retry.js",
    ]);
    await expect(readFile(path.join(workspacePath, "AGENTS.md"), "utf8")).resolves.toBe(
      "Use Conventional Commits.\n",
    );
    // The commit carries the harness identity, never the machine's.
    const identity = `${SEED_GIT_IDENTITY.name} <${SEED_GIT_IDENTITY.email}>`;
    expect(await git(workspacePath, "log", "-1", "--format=%an <%ae>%n%cn <%ce>")).toBe(
      `${identity}\n${identity}`,
    );
  });

  // The pre-push hook runs the gate with GIT_DIR exported as an absolute path under the caller's
  // repository, which from a git worktree lives under .git/worktrees/<name>. Seeding and the
  // assertions must both ignore it, or every seed command targets the caller's repository.
  it("stages the workspace when the caller's environment carries an absolute GIT_DIR", async () => {
    const callerRepo = await mkdtemp(path.join(os.tmpdir(), "seed-caller-"));
    await execFileAsync("git", ["init", "-q", "-b", "main", callerRepo], {
      env: seedGitEnvironment(),
    });
    vi.stubEnv("GIT_DIR", path.join(callerRepo, ".git"));

    const workspacePath = await stageSeed({
      workspaceFiles: { "src/index.js": "export const seed = false;\n" },
    });

    expect(await git(workspacePath, "rev-list", "--count", "HEAD")).toBe("1");
    expect(await git(workspacePath, "status", "--porcelain")).toBe(" M src/index.js");
    expect(await git(callerRepo, "rev-list", "--all", "--count")).toBe("0");
  });

  // A .git gitfile redirects git init to the repository it names, so it is rejected like a
  // directory; a nested repository would be staged as a gitlink; a symlink could carry a fixture
  // write outside the workspace.
  it.each([
    [
      "a .git directory",
      async (seedPath: string) => mkdir(path.join(seedPath, ".git")),
      ".git entry (.git)",
    ],
    [
      "a .git gitfile",
      async (seedPath: string) => writeFile(path.join(seedPath, ".git"), "gitdir: /x\n"),
      ".git entry (.git)",
    ],
    [
      "a nested .git directory",
      async (seedPath: string) => mkdir(path.join(seedPath, "vendor", ".git"), { recursive: true }),
      ".git entry (vendor/.git)",
    ],
    [
      "a symlink",
      async (seedPath: string) => symlink("src/index.js", path.join(seedPath, "entry.js")),
      "symlink (entry.js)",
    ],
  ])("rejects a seed that ships %s", async (_kind, prepareSeed, detail) => {
    await expect(stageSeed({ prepareSeed })).rejects.toThrow(
      `workspace seed "node-service" must not contain a ${detail}`,
    );
  });

  it("leaves a seed's .agents and .claude entries out of the copy", async () => {
    const workspacePath = await stageSeed({
      // Mixed case: the workspace may sit on a case-insensitive filesystem.
      seedFiles: {
        ".Claude/settings.json": '{ "seed": true }\n',
        ".agents/skills/SKILL.md": "seed skill\n",
      },
      // The lane's surface is already in the workspace and must survive the seed copy.
      baseFiles: { ".claude/settings.json": '{ "harness": true }\n' },
    });

    await expect(
      readFile(path.join(workspacePath, ".claude", "settings.json"), "utf8"),
    ).resolves.toBe('{ "harness": true }\n');
    await expect(
      readFile(path.join(workspacePath, ".agents", "skills", "SKILL.md"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("rejects a seed whose directory is itself a symlink", async () => {
    await expect(
      stageSeed({
        prepareSeed: async (seedPath) =>
          symlink("node-service", path.join(path.dirname(seedPath), "linked-seed")),
        workspace: { seed: "linked-seed" },
      }),
    ).rejects.toThrow('workspace seed "linked-seed" must not be a symlink');
  });

  it("names a missing seed directory instead of failing on a copy error", async () => {
    await expect(stageSeed({ workspace: { seed: "missing" } })).rejects.toThrow(
      'workspace seed "missing" not found at',
    );
  });

  it("still makes the one seed commit when the seed's .gitignore leaves nothing to add", async () => {
    const workspacePath = await stageSeed({ seedFiles: { ".gitignore": "*\n" } });

    expect(await git(workspacePath, "rev-list", "--count", "HEAD")).toBe("1");
    expect(await git(workspacePath, "ls-tree", "--name-only", "HEAD")).toBe("");
  });

  it("commits the seed even when a committed .gitignore ignores everything", async () => {
    const workspacePath = await stageSeed({
      workspace: { committed: { ".gitignore": "*\n!.gitignore\n" } },
    });

    expect(await trackedFiles(workspacePath)).toStrictEqual([
      ".gitignore",
      "package.json",
      "src/index.js",
    ]);
  });

  it("removes seed files the seed ignored when a committed .gitignore stops ignoring them", async () => {
    const workspacePath = await stageSeed({
      seedFiles: { ".gitignore": "secret.txt\n", "secret.txt": "hidden\n" },
      workspace: { committed: { ".gitignore": "" } },
    });

    expect(await git(workspacePath, "status", "--porcelain")).toBe("");
    expect(await trackedFiles(workspacePath)).toStrictEqual([
      ".gitignore",
      "package.json",
      "src/index.js",
    ]);
    await expect(readFile(path.join(workspacePath, "secret.txt"), "utf8")).rejects.toThrow(
      "ENOENT",
    );
  });

  // The ignore rules that count are the ones in the finished workspace, including a .gitignore
  // that workspace_files itself adds.
  it.each([
    [
      "the seed's .gitignore",
      { ".gitignore": "*.local\n" },
      { "notes.local": "unstaged\n", "notes.md": "visible\n" },
    ],
    [
      "a .gitignore in workspace_files",
      {},
      { ".gitignore": "*.local\n", "notes.local": "unstaged\n" },
    ],
  ])("rejects unstaged workspace files that %s would hide", async (_source, seedFiles, files) => {
    await expect(stageSeed({ seedFiles, workspaceFiles: files })).rejects.toThrow(
      'workspace_files "notes.local" would be ignored',
    );
  });

  it("commits the lane's harness surfaces even when the seed's .gitignore matches them", async () => {
    const workspacePath = await stageSeed({
      seedFiles: { ".gitignore": ".claude/\n.agents/\n" },
      baseFiles: {
        ".claude/settings.json": "{}\n",
        ".agents/skills/auto-skill/SKILL.md": "skill\n",
      },
    });

    expect(await trackedFiles(workspacePath)).toStrictEqual([
      ".agents/skills/auto-skill/SKILL.md",
      ".claude/settings.json",
      ".gitignore",
      "package.json",
      "src/index.js",
    ]);
    expect(await git(workspacePath, "status", "--porcelain")).toBe("");
  });

  it("adds declared filenames literally, not as pathspec patterns", async () => {
    const workspacePath = await stageSeed({
      workspace: {
        committed: { "[draft].md": "committed\n" },
        staged: { ":notes.md": "staged\n" },
      },
    });

    expect(await git(workspacePath, "ls-tree", "--name-only", "HEAD", "[draft].md")).toBe(
      "[draft].md",
    );
    expect(await git(workspacePath, "status", "--porcelain")).toBe("A  :notes.md");
  });

  it("adds committed and staged fixture files that the seed's .gitignore matches", async () => {
    const workspacePath = await stageSeed({
      seedFiles: { ".gitignore": "*.local\nbuild/\n" },
      workspace: {
        committed: { "config.local": "committed\n" },
        staged: { "build/output.js": "staged\n" },
      },
    });

    expect(await git(workspacePath, "ls-tree", "--name-only", "HEAD", "config.local")).toBe(
      "config.local",
    );
    expect(await git(workspacePath, "status", "--porcelain")).toBe("A  build/output.js");
  });

  it("commits seed files that the machine's global ignore file would exclude", async () => {
    const xdgConfigHome = await mkdtemp(path.join(os.tmpdir(), "seed-xdg-"));
    await mkdir(path.join(xdgConfigHome, "git"));
    await writeFile(path.join(xdgConfigHome, "git", "ignore"), "package.json\n");
    vi.stubEnv("XDG_CONFIG_HOME", xdgConfigHome);

    const workspacePath = await stageSeed();

    expect(await git(workspacePath, "ls-tree", "--name-only", "HEAD", "package.json")).toBe(
      "package.json",
    );
  });
});

describe("seedGitEnvironment", () => {
  it("drops inherited GIT_* variables and pins identity and config sources", () => {
    const env = seedGitEnvironment({
      PATH: "/usr/bin",
      GIT_DIR: "/elsewhere/.git",
      GIT_WORK_TREE: "/elsewhere",
      GIT_AUTHOR_NAME: "Machine User",
    });

    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["GIT_DIR"]).toBeUndefined();
    expect(env["GIT_WORK_TREE"]).toBeUndefined();
    expect(env["GIT_AUTHOR_NAME"]).toBe(SEED_GIT_IDENTITY.name);
    expect(env["GIT_AUTHOR_EMAIL"]).toBe(SEED_GIT_IDENTITY.email);
    expect(env["GIT_COMMITTER_NAME"]).toBe(SEED_GIT_IDENTITY.name);
    expect(env["GIT_COMMITTER_EMAIL"]).toBe(SEED_GIT_IDENTITY.email);
    expect(env["GIT_CONFIG_GLOBAL"]).toBe("/dev/null");
    expect(env["GIT_CONFIG_NOSYSTEM"]).toBe("1");
    // The global ignore and attributes files live outside the global config file.
    expect(env["GIT_CONFIG_COUNT"]).toBe("2");
    expect(env["GIT_CONFIG_KEY_0"]).toBe("core.excludesFile");
    expect(env["GIT_CONFIG_VALUE_0"]).toBe("/dev/null");
    expect(env["GIT_CONFIG_KEY_1"]).toBe("core.attributesFile");
    expect(env["GIT_CONFIG_VALUE_1"]).toBe("/dev/null");
  });
});
