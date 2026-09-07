import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveSeedPath,
  SEED_GIT_IDENTITY,
  seedGitEnvironment,
  stageSeededWorkspace,
} from "./seeds.js";
import { writeSeedFixture } from "./test-utils.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trimEnd();
}

describe("resolveSeedPath", () => {
  it("locates seeds under evals/seeds/<name> in the repository", () => {
    expect(resolveSeedPath("/repo", "node-service")).toBe(
      path.join("/repo", "evals", "seeds", "node-service"),
    );
  });
});

describe("stageSeededWorkspace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Spec: "Every seed is a git repository: git init -b <branch>, no remote, one commit of seed +
  // committed files, then staged files written and git added, then workspace_files written
  // unstaged."
  it("stages the seed as a one-commit repository with staged and unstaged layers", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");
    await mkdir(path.join(workspacePath, ".claude"), { recursive: true });
    await writeFile(path.join(workspacePath, ".claude", "settings.json"), "{}\n");

    await stageSeededWorkspace({
      repoRoot,
      workspacePath,
      workspace: {
        seed: "node-service",
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
    expect(
      (await git(workspacePath, "ls-tree", "-r", "--name-only", "HEAD")).split("\n"),
    ).toStrictEqual([".claude/settings.json", "AGENTS.md", "package.json", "src/index.js"]);
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

  // A .git gitfile redirects git init to the repository it names, so it is rejected like a directory.
  it.each([
    ["directory", async (seedPath: string) => mkdir(path.join(seedPath, ".git"))],
    ["gitfile", async (seedPath: string) => writeFile(path.join(seedPath, ".git"), "gitdir: /x\n")],
  ])("rejects a seed that ships its own .git %s", async (_kind, writeGitEntry) => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    await writeGitEntry(resolveSeedPath(repoRoot, "node-service"));
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");

    await expect(
      stageSeededWorkspace({
        repoRoot,
        workspacePath,
        workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
      }),
    ).rejects.toThrow('workspace seed "node-service" must not contain a .git entry');
  });

  it("copies seed symlinks verbatim instead of resolving them into the source seed", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    await symlink("src/index.js", path.join(resolveSeedPath(repoRoot, "node-service"), "entry.js"));
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");

    await stageSeededWorkspace({
      repoRoot,
      workspacePath,
      workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
    });

    expect(await readlink(path.join(workspacePath, "entry.js"))).toBe("src/index.js");
  });

  it("leaves a seed's .agents and .claude entries out of the copy", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    const seedPath = resolveSeedPath(repoRoot, "node-service");
    await mkdir(path.join(seedPath, ".claude"));
    await writeFile(path.join(seedPath, ".claude", "settings.json"), '{ "seed": true }\n');
    await mkdir(path.join(seedPath, ".agents", "skills"), { recursive: true });
    await writeFile(path.join(seedPath, ".agents", "skills", "SKILL.md"), "seed skill\n");
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");
    // The lane's surface is already in the workspace and must survive the seed copy.
    await mkdir(path.join(workspacePath, ".claude"), { recursive: true });
    await writeFile(path.join(workspacePath, ".claude", "settings.json"), '{ "harness": true }\n');

    await stageSeededWorkspace({
      repoRoot,
      workspacePath,
      workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
    });

    await expect(
      readFile(path.join(workspacePath, ".claude", "settings.json"), "utf8"),
    ).resolves.toBe('{ "harness": true }\n');
    await expect(
      readFile(path.join(workspacePath, ".agents", "skills", "SKILL.md"), "utf8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("adds committed and staged fixture files that the seed's .gitignore matches", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    await writeFile(
      path.join(resolveSeedPath(repoRoot, "node-service"), ".gitignore"),
      "*.local\nbuild/\n",
    );
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");

    await stageSeededWorkspace({
      repoRoot,
      workspacePath,
      workspace: {
        seed: "node-service",
        branch: "main",
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
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    await writeSeedFixture(repoRoot, "node-service");
    const xdgConfigHome = await mkdtemp(path.join(os.tmpdir(), "seed-xdg-"));
    await mkdir(path.join(xdgConfigHome, "git"));
    await writeFile(path.join(xdgConfigHome, "git", "ignore"), "package.json\n");
    vi.stubEnv("XDG_CONFIG_HOME", xdgConfigHome);
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");

    await stageSeededWorkspace({
      repoRoot,
      workspacePath,
      workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
    });

    expect(await git(workspacePath, "ls-tree", "--name-only", "HEAD", "package.json")).toBe(
      "package.json",
    );
  });

  it("names a missing seed directory instead of failing on a copy error", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "seed-repo-"));
    const workspacePath = path.join(await mkdtemp(path.join(os.tmpdir(), "seed-ws-")), "workspace");

    await expect(
      stageSeededWorkspace({
        repoRoot,
        workspacePath,
        workspace: { seed: "missing", branch: "main", committed: {}, staged: {} },
      }),
    ).rejects.toThrow('workspace seed "missing" not found at');
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
