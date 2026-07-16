import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { selectMarketplaceSuite, selectPluginSuite } from "./suite.js";

describe("selectPluginSuite", () => {
  it("partitions fixture-bearing skills by the agent's invocation policy", async () => {
    const repoRoot = await writeSuiteFixture();

    const suite = await selectPluginSuite(repoRoot, "plugins/demo", "codex");

    expect(suite.skillPaths).toStrictEqual([path.join("plugins", "demo", "skills", "auto-skill")]);
    expect(suite.manualOnlySkillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "manual-skill"),
    ]);
  });

  it("rejects paths that are not plugin directories", async () => {
    const repoRoot = await writeSuiteFixture();

    await expect(
      selectPluginSuite(repoRoot, "plugins/demo/skills/auto-skill", "codex"),
    ).rejects.toThrow("Expected a plugin path like plugins/<plugin>");
  });

  it("rejects plugins without trigger fixtures", async () => {
    const repoRoot = await writeSuiteFixture();
    await mkdir(path.join(repoRoot, "plugins", "empty", "skills"), { recursive: true });

    await expect(selectPluginSuite(repoRoot, "plugins/empty", "codex")).rejects.toThrow(
      "plugins/empty has no skills with trigger fixtures.",
    );
  });
});

describe("selectMarketplaceSuite", () => {
  it("reads the agent-specific catalog", async () => {
    const repoRoot = await writeSuiteFixture();

    const codexSuite = await selectMarketplaceSuite(repoRoot, "codex");
    expect(codexSuite.skillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
    ]);

    const claudeSuite = await selectMarketplaceSuite(repoRoot, "claude");
    expect(claudeSuite.skillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "claude-only", "skills", "claude-skill"),
    ]);
  });
});

// Repo fixture: plugin "demo" with an implicit skill (fixture), a manual-only skill (fixture),
// and an implicit skill without a fixture; plugin "claude-only" listed only in the Claude catalog.
async function writeSuiteFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-suite-"));

  await writeSkill(repoRoot, "demo", "auto-skill", { fixture: true });
  await writeSkill(repoRoot, "demo", "manual-skill", { fixture: true, manualOnly: true });
  await writeSkill(repoRoot, "demo", "no-fixture-skill", { fixture: false });
  await writeSkill(repoRoot, "claude-only", "claude-skill", { fixture: true });

  await mkdir(path.join(repoRoot, ".agents", "plugins"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
    JSON.stringify({
      name: "fixture-marketplace",
      plugins: [{ name: "demo", source: { source: "local", path: "./plugins/demo" } }],
    }),
  );
  await mkdir(path.join(repoRoot, ".claude-plugin"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "fixture-marketplace",
      plugins: [
        { name: "demo", source: "./plugins/demo" },
        { name: "claude-only", source: "./plugins/claude-only" },
      ],
    }),
  );

  return repoRoot;
}

async function writeSkill(
  repoRoot: string,
  pluginName: string,
  skillName: string,
  options: { fixture: boolean; manualOnly?: boolean },
): Promise<void> {
  const skillPath = path.join(repoRoot, "plugins", pluginName, "skills", skillName);
  await mkdir(path.join(skillPath, "agents"), { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    [
      "---",
      `name: ${skillName}`,
      `description: Use when the user asks for ${skillName}.`,
      ...(options.manualOnly === true ? ["disable-model-invocation: true"] : []),
      "---",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    `version: 1\npolicy:\n  allow_implicit_invocation: ${options.manualOnly === true ? "false" : "true"}\n`,
  );
  if (options.fixture) {
    await mkdir(path.join(skillPath, "evals"), { recursive: true });
    await writeFile(
      path.join(skillPath, "evals", "triggers.yaml"),
      [
        "version: 1",
        "cases:",
        "  - id: case-a",
        "    prompt: Invoke.",
        "    expect: invoke",
        "",
      ].join("\n"),
    );
  }
}
