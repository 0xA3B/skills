import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadTriggerFixture } from "./fixtures.js";

describe("loadTriggerFixture", () => {
  it("loads trigger fixtures with positive and negative cases", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
    workspace_files:
      AGENTS.md: |
        Commit messages must use Conventional Commits.
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).resolves.toMatchObject({
      version: 1,
      cases: [
        {
          id: "commit-message",
          expect: "invoke",
          workspaceFiles: { "AGENTS.md": "Commit messages must use Conventional Commits.\n" },
        },
        { id: "general-question", expect: "skip" },
      ],
    });
  });

  // Spec: "workspace: fixture-level default ... branch: optional, default main ... cases[].workspace
  // replaces the fixture default wholesale ... workspace: none opts out of the fixture default".
  it("applies the fixture-level workspace default and lets cases replace or opt out", async () => {
    const fixturePath = await writeFixture(`
version: 1
workspace:
  seed: node-service
  committed:
    AGENTS.md: |
      Use Conventional Commits.
workspace_files:
  notes.md: Shared note.
cases:
  - id: inherits-default
    prompt: Review the staged changes.
    expect: invoke
  - id: replaces-default
    prompt: Fix the parser.
    expect: invoke
    workspace:
      seed: other-seed
      branch: feature/parser
      staged:
        src/parser.js: "export {};\\n"
  - id: opts-out
    prompt: What is a commit?
    expect: skip
    workspace: none
`);

    const fixture = await loadTriggerFixture(fixturePath);

    expect(fixture.cases.map((testCase) => testCase.workspace)).toStrictEqual([
      {
        seed: "node-service",
        branch: "main",
        committed: { "AGENTS.md": "Use Conventional Commits.\n" },
        staged: {},
      },
      {
        seed: "other-seed",
        branch: "feature/parser",
        committed: {},
        staged: { "src/parser.js": "export {};\n" },
      },
      undefined,
    ]);
    // Opting out of the workspace default leaves the fixture-level workspace_files in place.
    expect(fixture.cases.map((testCase) => testCase.workspaceFiles)).toStrictEqual([
      { "notes.md": "Shared note." },
      { "notes.md": "Shared note." },
      { "notes.md": "Shared note." },
    ]);
  });

  it("rejects workspace: none at the fixture level", async () => {
    const fixturePath = await writeFixture(`
version: 1
workspace: none
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      "expected workspace to be an object",
    );
  });

  // The names git check-ref-format --branch rejects must fail at load time, not during staging.
  it.each([
    "feature branch",
    "release..candidate",
    ".",
    "feature/",
    "/feature",
    "a//b",
    ".hidden",
    "topic/.hidden",
    "index.lock",
    "-flag",
    "trailing.",
  ])("rejects the workspace branch %s that git would refuse", async (branch) => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: bad-branch
    prompt: Review the staged changes.
    expect: invoke
    workspace:
      seed: node-service
      branch: ${JSON.stringify(branch)}
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      "expected cases[0].workspace.branch to be a git branch name",
    );
  });

  it.each(["main", "feature/retry", "session/retry-policy", "v1.2", "fix-date_parse"])(
    "accepts the workspace branch %s",
    async (branch) => {
      const fixturePath = await writeFixture(`
version: 1
cases:
  - id: good-branch
    prompt: Review the staged changes.
    expect: invoke
    workspace:
      seed: node-service
      branch: ${JSON.stringify(branch)}
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

      const fixture = await loadTriggerFixture(fixturePath);
      expect(fixture.cases[0]?.workspace?.branch).toBe(branch);
    },
  );

  // Git matches .git case-insensitively at any depth, so the guard must too; a leading "./"
  // normalizes away when the file is written. The lane owns .agents and .claude in the workspace;
  // a backslash would become a literal filename on POSIX; a trailing "/" names a directory.
  it.each([
    ".git/hooks/pre-commit",
    "./.git/config",
    ".GIT/hooks/pre-commit",
    "lib/.git/config",
    ".claude/settings.json",
    ".agents/skills/other/SKILL.md",
    "src\\\\retry.js",
    "docs/",
  ])("rejects the workspace file path %s as unsafe or harness-owned", async (filePath) => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: hook
    prompt: Review the staged changes.
    expect: invoke
    workspace:
      seed: node-service
      committed:
        ${JSON.stringify(filePath)}: "exit 0"
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      `workspace.committed path "${filePath}" to be a safe relative path`,
    );
  });

  // Spec: "workspace_files: fixture-level unstaged files, merged per path (case wins)".
  it("merges fixture-level workspace_files under case workspace_files per path", async () => {
    const fixturePath = await writeFixture(`
version: 1
workspace_files:
  AGENTS.md: Fixture default.
  README.md: Shared readme.
cases:
  - id: overrides-one-path
    prompt: Commit this.
    expect: invoke
    workspace_files:
      AGENTS.md: Case override.
  - id: inherits-all
    prompt: What is a commit?
    expect: skip
`);

    const fixture = await loadTriggerFixture(fixturePath);

    expect(fixture.cases.map((testCase) => testCase.workspaceFiles)).toStrictEqual([
      { "AGENTS.md": "Case override.", "README.md": "Shared readme." },
      { "AGENTS.md": "Fixture default.", "README.md": "Shared readme." },
    ]);
  });

  it("rejects a workspace block whose seed is not a kebab-case name", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: bad-seed
    prompt: Review the staged changes.
    expect: invoke
    workspace:
      seed: ../escape
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      "expected cases[0].workspace.seed to be a kebab-case seed name",
    );
  });

  it("rejects unsafe paths in committed and staged workspace files", async () => {
    const fixturePath = await writeFixture(`
version: 1
workspace:
  seed: node-service
  staged:
    /etc/passwd: Invalid.
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      'workspace.staged path "/etc/passwd" to be a safe relative path',
    );
  });

  it("requires at least one skip case", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      "expected at least one case with expect: skip",
    );
  });

  it("rejects unsafe workspace file paths", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
    workspace_files:
      ../AGENTS.md: Invalid.
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(
      'workspace_files path "../AGENTS.md" to be a safe relative path',
    );
  });
});

async function writeFixture(content: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "trigger-fixture-"));
  const fixturePath = path.join(tempDir, "triggers.yaml");
  await writeFile(fixturePath, content.trimStart());
  return fixturePath;
}
