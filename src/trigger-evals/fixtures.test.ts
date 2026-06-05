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
