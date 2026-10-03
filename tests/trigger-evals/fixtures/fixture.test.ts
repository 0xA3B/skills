import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";

import {
  loadTriggerFixture,
  parseTriggerFixture,
} from "../../../src/trigger-evals/fixtures/fixture.js";

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

  it("keeps a __proto__ filename as an own entry of the file map", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: proto
    prompt: Review the staged changes.
    expect: invoke
    workspace:
      seed: node-service
      committed:
        __proto__: "not a prototype"
  - id: general-question
    prompt: What is a commit?
    expect: skip
`);

    const fixture = await loadTriggerFixture(fixturePath);
    const committed = fixture.cases[0]?.workspace?.committed ?? {};
    expect(Object.hasOwn(committed, "__proto__")).toBe(true);
    expect(Object.entries(committed)).toStrictEqual([["__proto__", "not a prototype"]]);
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

  // Spec: "invoke-instead: <label> is valid only on expect: skip cases."
  it("reads invoke-instead on skip cases", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: commit-message
    prompt: Draft a Conventional Commit message.
    expect: invoke
  - id: existing-feedback
    prompt: Address these review comments.
    expect: skip
    invoke-instead: engineering:receiving-feedback
`);

    const fixture = await loadTriggerFixture(fixturePath);
    expect(fixture.cases[1]).toStrictEqual({
      id: "existing-feedback",
      prompt: "Address these review comments.",
      expect: "skip",
      invokeInstead: "engineering:receiving-feedback",
    });
    expect(fixture.cases[0]).not.toHaveProperty("invokeInstead");
  });

  // Spec: "fixtures.ts owns the schema and collects every finding ... instead of throwing at the
  // first; invalid YAML yields one finding. The runner's load aggregates findings into one thrown
  // error."
  it("collects every finding before failing the load", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: Bad Id
    prompt: Draft a Conventional Commit message.
    expect: invoke
    workspace:
      seed: Not Kebab
  - id: general-question
    prompt: What is a commit?
    expect: maybe
`);

    const error = await loadTriggerFixture(fixturePath).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    const lines = (error as Error).message.split("\n");
    expect(lines).toStrictEqual([
      `${fixturePath}: expected cases[0].id to be 1-80 lowercase letters, numbers, or hyphens.`,
      `${fixturePath}: expected cases[0].workspace.seed to be a kebab-case seed name.`,
      `${fixturePath}: expected cases[1].expect to be invoke or skip.`,
    ]);
  });

  it("reports invalid YAML as one finding", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: [unterminated
`);

    expect(parseTriggerFixture("version: 1\ncases:\n  - id: [unterminated\n")).toMatchObject({
      fixture: undefined,
      findings: [{ path: [], message: expect.stringMatching(/^invalid YAML: /) }],
    });
    await expect(loadTriggerFixture(fixturePath)).rejects.toThrow(`${fixturePath}: invalid YAML: `);
  });

  it("exposes findings with structural paths for the linter", () => {
    const { fixture, findings } = parseTriggerFixture(
      "version: 1\ncases:\n  - id: a\n    prompt: p\n    expect: skip\n    invoke-instead: 3\n",
    );

    expect(fixture).toBeUndefined();
    expect(findings).toStrictEqual([
      {
        path: ["cases", 0, "invoke-instead"],
        message:
          "expected cases[0].invoke-instead to be a skill label: <plugin>:<skill> or a bare repo-local skill name.",
      },
      { path: ["cases"], message: "expected at least one case with expect: invoke." },
    ]);
  });
});

async function writeFixture(content: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "trigger-fixture-"));
  const fixturePath = path.join(tempDir, "triggers.yaml");
  await writeFile(fixturePath, content.trimStart());
  return fixturePath;
}

// A valid fixture of one invoke case and one skip case. Each part's keys are spread over the
// fixture root or its case, so a row states only what it changes.
function fixtureYaml(
  parts: {
    top?: Record<string, unknown>;
    firstCase?: Record<string, unknown>;
    secondCase?: Record<string, unknown>;
  } = {},
): string {
  return stringifyYaml({
    version: 1,
    ...parts.top,
    cases: [
      { id: "invoke-case", prompt: "Do the thing.", expect: "invoke", ...parts.firstCase },
      { id: "skip-case", prompt: "Do something else.", expect: "skip", ...parts.secondCase },
    ],
  });
}

const notASkillLabel = {
  path: ["cases", 1, "invoke-instead"],
  message:
    "expected cases[1].invoke-instead to be a skill label: <plugin>:<skill> or a bare repo-local skill name.",
};

describe("loadTriggerFixture case selection", () => {
  it("keeps only the requested cases in fixture order", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: first
    prompt: First prompt.
    expect: invoke
  - id: second
    prompt: Second prompt.
    expect: skip
  - id: third
    prompt: Third prompt.
    expect: skip
`);

    const fixture = await loadTriggerFixture(fixturePath, { caseIds: ["third", "first"] });

    expect(fixture.cases.map((testCase) => testCase.id)).toStrictEqual(["first", "third"]);
  });

  it("rejects an unknown requested case id", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: first
    prompt: First prompt.
    expect: invoke
  - id: second
    prompt: Second prompt.
    expect: skip
`);

    await expect(
      loadTriggerFixture(fixturePath, { caseIds: ["first", "missing"] }),
    ).rejects.toThrow('No trigger fixture case found with id "missing".');
  });
});

describe("parseTriggerFixture details", () => {
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
    "HEAD",
  ])("rejects the workspace branch %s that git would refuse", (branch) => {
    expect(
      parseTriggerFixture(
        fixtureYaml({ firstCase: { workspace: { seed: "node-service", branch } } }),
      ),
    ).toStrictEqual({
      fixture: undefined,
      findings: [
        {
          path: ["cases", 0, "workspace", "branch"],
          message: "expected cases[0].workspace.branch to be a git branch name.",
        },
      ],
    });
  });

  it.each(["main", "feature/retry", "session/retry-policy", "v1.2", "fix-date_parse"])(
    "accepts the workspace branch %s",
    (branch) => {
      const { fixture } = parseTriggerFixture(
        fixtureYaml({ firstCase: { workspace: { seed: "node-service", branch } } }),
      );

      expect(fixture?.cases[0]?.workspace?.branch).toBe(branch);
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
    "src\\retry.js",
    "docs/",
    "bad\u0000name",
  ])("rejects the workspace file path %s as unsafe or harness-owned", (filePath) => {
    expect(
      parseTriggerFixture(
        fixtureYaml({
          firstCase: { workspace: { seed: "node-service", committed: { [filePath]: "exit 0" } } },
        }),
      ),
    ).toStrictEqual({
      fixture: undefined,
      findings: [
        {
          path: ["cases", 0, "workspace", "committed", filePath],
          message: `expected cases[0].workspace.committed path "${filePath}" to be a safe relative path outside .git, .agents, and .claude.`,
        },
      ],
    });
  });

  it.each([
    [
      "a fixture root that is not an object",
      stringifyYaml(["not-a-fixture"]),
      [{ path: [], message: "expected fixture root to be an object." }],
    ],
    // An unreadable case cannot count toward the presence checks, so it is the only finding.
    [
      "a case that is not an object",
      stringifyYaml({
        version: 1,
        cases: ["not-a-case", { id: "skip-case", prompt: "Do something else.", expect: "skip" }],
      }),
      [{ path: ["cases", 0], message: "expected cases[0] to be an object." }],
    ],
    [
      "a case id outside the id pattern",
      fixtureYaml({ firstCase: { id: "Bad_Id" } }),
      [
        {
          path: ["cases", 0, "id"],
          message: "expected cases[0].id to be 1-80 lowercase letters, numbers, or hyphens.",
        },
      ],
    ],
    [
      "a case workspace that is neither an object nor none",
      fixtureYaml({ firstCase: { workspace: 3 } }),
      [
        {
          path: ["cases", 0, "workspace"],
          message: 'expected cases[0].workspace to be an object or "none".',
        },
      ],
    ],
    [
      "a fixture-level workspace_files that is not an object",
      fixtureYaml({ top: { workspace_files: "src/a.ts" } }),
      [{ path: ["workspace_files"], message: "expected workspace_files to be an object." }],
    ],
    [
      "a version other than 1",
      fixtureYaml({ top: { version: 2 } }),
      [{ path: ["version"], message: "expected version: 1." }],
    ],
    [
      "workspace: none at the fixture level",
      fixtureYaml({ top: { workspace: "none" } }),
      [{ path: ["workspace"], message: "expected workspace to be an object." }],
    ],
    [
      "a fixture without a skip case",
      fixtureYaml({ secondCase: { expect: "invoke" } }),
      [{ path: ["cases"], message: "expected at least one case with expect: skip." }],
    ],
    // A case without a readable prompt is dropped, so it no longer counts as the skip case.
    [
      "an empty prompt",
      fixtureYaml({ secondCase: { prompt: "" } }),
      [
        {
          path: ["cases", 1, "prompt"],
          message: "expected cases[1].prompt to be a non-empty string.",
        },
        { path: ["cases"], message: "expected at least one case with expect: skip." },
      ],
    ],
    [
      "an empty rationale",
      fixtureYaml({ firstCase: { rationale: "" } }),
      [
        {
          path: ["cases", 0, "rationale"],
          message: "expected cases[0].rationale to be a non-empty string when provided.",
        },
      ],
    ],
    [
      "a workspace seed that is not a kebab-case name",
      fixtureYaml({ firstCase: { workspace: { seed: "../escape" } } }),
      [
        {
          path: ["cases", 0, "workspace", "seed"],
          message: "expected cases[0].workspace.seed to be a kebab-case seed name.",
        },
      ],
    ],
    [
      "an unsafe committed path in the fixture-level workspace",
      fixtureYaml({
        top: { workspace: { seed: "node-service", committed: { "/etc/passwd": "Invalid." } } },
      }),
      [
        {
          path: ["workspace", "committed", "/etc/passwd"],
          message:
            'expected workspace.committed path "/etc/passwd" to be a safe relative path outside .git, .agents, and .claude.',
        },
      ],
    ],
    [
      "an unsafe staged path in the fixture-level workspace",
      fixtureYaml({
        top: { workspace: { seed: "node-service", staged: { "/etc/passwd": "Invalid." } } },
      }),
      [
        {
          path: ["workspace", "staged", "/etc/passwd"],
          message:
            'expected workspace.staged path "/etc/passwd" to be a safe relative path outside .git, .agents, and .claude.',
        },
      ],
    ],
    [
      "an unsafe path in a case's workspace_files",
      fixtureYaml({ firstCase: { workspace_files: { "../AGENTS.md": "Invalid." } } }),
      [
        {
          path: ["cases", 0, "workspace_files", "../AGENTS.md"],
          message:
            'expected cases[0].workspace_files path "../AGENTS.md" to be a safe relative path outside .git, .agents, and .claude.',
        },
      ],
    ],
    [
      "invoke-instead on an invoke case",
      fixtureYaml({ firstCase: { "invoke-instead": "engineering:tdd" } }),
      [
        {
          path: ["cases", 0, "invoke-instead"],
          message: "expected cases[0].invoke-instead only on expect: skip cases.",
        },
      ],
    ],
    [
      "an empty invoke-instead label",
      fixtureYaml({ secondCase: { "invoke-instead": "" } }),
      [notASkillLabel],
    ],
    [
      "an invoke-instead label that climbs out of the skills tree",
      fixtureYaml({ secondCase: { "invoke-instead": "git:../../../.agents/skills/x" } }),
      [notASkillLabel],
    ],
    [
      "an invoke-instead label with capitals and a space",
      fixtureYaml({ secondCase: { "invoke-instead": "Git:Commit extra" } }),
      [notASkillLabel],
    ],
  ])("rejects %s", (_name, yaml, findings) => {
    expect(parseTriggerFixture(yaml)).toStrictEqual({ fixture: undefined, findings });
  });

  it("reports duplicate case ids at the repeated case and keeps parsing", () => {
    const parsed = parseTriggerFixture(`
version: 1
cases:
  - id: same
    prompt: First prompt.
    expect: invoke
  - id: same
    prompt: Second prompt.
    expect: skip
  - id: broken
    prompt: Third prompt.
    expect: maybe
`);

    expect(parsed.findings).toStrictEqual([
      { path: ["cases", 1, "id"], message: 'duplicate case id "same".' },
      { path: ["cases", 2, "expect"], message: "expected cases[2].expect to be invoke or skip." },
    ]);
  });

  it("reports a file-map entry whose content is not a string at its key", () => {
    const parsed = parseTriggerFixture(`
version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
    workspace_files:
      src/a.ts: 3
  - id: skip-case
    prompt: Do something else.
    expect: skip
`);

    expect(parsed.findings).toStrictEqual([
      {
        path: ["cases", 0, "workspace_files", "src/a.ts"],
        message: 'expected cases[0].workspace_files["src/a.ts"] to be a string.',
      },
    ]);
  });

  it("keeps the fixture-level workspace default and shares it with inheriting cases", () => {
    const { fixture } = parseTriggerFixture(`
version: 1
workspace:
  seed: node-service
cases:
  - id: inherits
    prompt: Do the thing.
    expect: invoke
  - id: own
    prompt: Do something else.
    expect: skip
    workspace:
      seed: other-seed
`);

    expect(fixture?.workspace).toStrictEqual({
      seed: "node-service",
      branch: "main",
      committed: {},
      staged: {},
    });
    expect(fixture?.cases[0]?.workspace).toBe(fixture?.workspace);
    expect(fixture?.cases[1]?.workspace).not.toBe(fixture?.workspace);
  });

  it("rejects an empty caseIds selection", async () => {
    const fixturePath = await writeFixture(`
version: 1
cases:
  - id: first
    prompt: First prompt.
    expect: invoke
  - id: second
    prompt: Second prompt.
    expect: skip
`);

    await expect(loadTriggerFixture(fixturePath, { caseIds: [] })).rejects.toThrow(
      "caseIds must name at least one case; omit it to run every case.",
    );
  });
});
