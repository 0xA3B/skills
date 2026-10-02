import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  selectMarketplaceSuite,
  selectPluginSuite,
} from "../../../src/trigger-evals/selection/suite.js";
import { triggerFixtureYaml, writeMarketplaceCatalogs, writeSkillFiles } from "../test-utils.js";

describe("selectPluginSuite", () => {
  it("partitions fixture-bearing skills by the agent's invocation policy", async () => {
    const repoRoot = await writeSuiteFixture();

    const suite = await selectPluginSuite(repoRoot, "plugins/demo", "codex");

    expect(suite.skillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "demo", "skills", "extra-skill"),
    ]);
    expect(suite.manualOnlySkillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "manual-skill"),
    ]);
    expect(suite.outOfCatalogSkillPaths).toStrictEqual([]);
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
      path.join("plugins", "demo", "skills", "extra-skill"),
    ]);

    const claudeSuite = await selectMarketplaceSuite(repoRoot, "claude");
    expect(claudeSuite.skillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "demo", "skills", "extra-skill"),
      path.join("plugins", "claude-only", "skills", "claude-skill"),
    ]);
  });

  it("runs only the selected skills in suite order, normalizing and deduping paths", async () => {
    const repoRoot = await writeSuiteFixture();

    const suite = await selectMarketplaceSuite(repoRoot, "codex", [
      "plugins/demo/skills/extra-skill/",
      "plugins/demo/skills/auto-skill",
      "plugins/demo/skills/auto-skill",
    ]);

    expect(suite.skillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "demo", "skills", "extra-skill"),
    ]);
    expect(suite.manualOnlySkillPaths).toStrictEqual([]);
    expect(suite.outOfCatalogSkillPaths).toStrictEqual([]);
  });

  it("reports selected manual-only skills instead of running them", async () => {
    const repoRoot = await writeSuiteFixture();

    const suite = await selectMarketplaceSuite(repoRoot, "codex", [
      "plugins/demo/skills/auto-skill",
      "plugins/demo/skills/manual-skill",
    ]);

    expect(suite.skillPaths).toStrictEqual([path.join("plugins", "demo", "skills", "auto-skill")]);
    expect(suite.manualOnlySkillPaths).toStrictEqual([
      path.join("plugins", "demo", "skills", "manual-skill"),
    ]);
  });

  it("reports selected skills whose plugin is outside the agent's catalog", async () => {
    const repoRoot = await writeSuiteFixture();

    const suite = await selectMarketplaceSuite(repoRoot, "codex", [
      "plugins/claude-only/skills/claude-skill",
    ]);

    expect(suite.skillPaths).toStrictEqual([]);
    expect(suite.outOfCatalogSkillPaths).toStrictEqual([
      path.join("plugins", "claude-only", "skills", "claude-skill"),
    ]);
  });

  it("rejects selected skills without a trigger fixture", async () => {
    const repoRoot = await writeSuiteFixture();

    await expect(
      selectMarketplaceSuite(repoRoot, "codex", ["plugins/demo/skills/no-fixture-skill"]),
    ).rejects.toThrow("has no trigger fixture at evals/triggers.yaml");
  });

  it("rejects selected repo-local skills", async () => {
    const repoRoot = await writeSuiteFixture();

    await expect(
      selectMarketplaceSuite(repoRoot, "codex", [".agents/skills/local-skill"]),
    ).rejects.toThrow("--marketplace runs plugin skills; ");
  });

  it("rejects malformed selected paths", async () => {
    const repoRoot = await writeSuiteFixture();

    await expect(selectMarketplaceSuite(repoRoot, "codex", ["plugins/demo"])).rejects.toThrow(
      "Expected a skill path like plugins/<plugin>/skills/<skill>",
    );
  });
});

// Repo fixture: plugin "demo" with two implicit skills (fixtures), a manual-only skill (fixture),
// and an implicit skill without a fixture; plugin "claude-only" listed only in the Claude catalog.
async function writeSuiteFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-suite-"));
  const demoSkills = path.join(repoRoot, "plugins", "demo", "skills");

  await writeSkillFiles(path.join(demoSkills, "auto-skill"), { fixture: triggerFixtureYaml() });
  await writeSkillFiles(path.join(demoSkills, "extra-skill"), { fixture: triggerFixtureYaml() });
  await writeSkillFiles(path.join(demoSkills, "manual-skill"), {
    fixture: triggerFixtureYaml(),
    manualOnly: true,
  });
  await writeSkillFiles(path.join(demoSkills, "no-fixture-skill"));
  await writeSkillFiles(path.join(repoRoot, "plugins", "claude-only", "skills", "claude-skill"), {
    fixture: triggerFixtureYaml(),
  });
  await writeMarketplaceCatalogs(repoRoot, { codex: ["demo"], claude: ["demo", "claude-only"] });

  return repoRoot;
}
