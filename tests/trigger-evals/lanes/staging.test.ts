import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSkill, type Skill } from "../../../src/skills/index.js";
import {
  type DeploymentOptions,
  stageDeployment,
} from "../../../src/trigger-evals/lanes/staging.js";
import { createRuntimeResources } from "../../../src/trigger-evals/runtime.js";
import { triggerFixtureYaml, writeRepoFixture, writeRepoLocalSkillFixture } from "../test-utils.js";

function deploymentOptions(
  target: Skill,
  overrides: Partial<DeploymentOptions> = {},
): DeploymentOptions {
  return {
    target,
    plugins: [],
    repoLocalSkills: [],
    repoLocalSurface: ".agents",
    runtime: createRuntimeResources(),
    ...overrides,
  };
}

function stagedPluginSkill(deploymentPath: string, pluginName: string, skillName: string): string {
  return path.join(deploymentPath, "plugins", pluginName, "skills", skillName, "SKILL.md");
}

describe("stageDeployment", () => {
  it("labels every staged plugin skill and watches the target and implicit siblings", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "sibling-skill" }, { name: "manual-skill", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(deploymentOptions(target));

    expect([...deployment.stagedSkillLabels].sort()).toStrictEqual([
      "demo:auto-skill",
      "demo:manual-skill",
      "demo:sibling-skill",
    ]);
    expect(deployment.invocableSkills).toStrictEqual([
      { skillLabel: "demo:auto-skill", pluginName: "demo", skillName: "auto-skill" },
      { skillLabel: "demo:sibling-skill", pluginName: "demo", skillName: "sibling-skill" },
    ]);
  });

  it("watches a manual-only plugin target, as a forced run needs", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");
    await writeFile(
      target.skillFilePath,
      "---\nname: auto-skill\ndisable-model-invocation: true\n---\n",
    );

    const deployment = await stageDeployment(deploymentOptions(target));

    expect(deployment.invocableSkills.map((skill) => skill.skillLabel)).toStrictEqual([
      "demo:auto-skill",
    ]);
  });

  it("stages plugin skills byte-identical to the committed skills", async () => {
    const repoRoot = await writeRepoFixture();
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(deploymentOptions(target));

    await expect(
      readFile(stagedPluginSkill(deployment.deploymentPath, "demo", "auto-skill"), "utf8"),
    ).resolves.toBe(await readFile(target.skillFilePath, "utf8"));
  });

  it("stages a plugin target's own plugin once even when the catalog lists it", async () => {
    const repoRoot = await writeRepoFixture({ marketplace: true });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(
      deploymentOptions(target, {
        plugins: [
          { pluginName: "demo", pluginPath: path.join(repoRoot, "plugins", "demo") },
          { pluginName: "other", pluginPath: path.join(repoRoot, "plugins", "other") },
        ],
      }),
    );

    expect(deployment.stagedPlugins.map((plugin) => plugin.pluginName)).toStrictEqual([
      "demo",
      "other",
    ]);
  });

  it("resolves plugin versions from the portable manifest before the Claude extension", async () => {
    const repoRoot = await writeRepoFixture({ portableVersion: "3.0.0" });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(deploymentOptions(target));

    expect(deployment.stagedPlugins).toStrictEqual([
      { pluginName: "demo", sourcePath: path.join(repoRoot, "plugins", "demo"), version: "3.0.0" },
    ]);
  });

  it("resolves plugin versions from the Claude extension when no portable manifest ships", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(deploymentOptions(target));

    expect(deployment.stagedPlugins.map((plugin) => plugin.version)).toStrictEqual(["1.0.0"]);
  });

  it("gives a repo-local target no exception for plugin skills and watches implicit siblings", async () => {
    const pluginRepoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const repoRoot = await writeRepoLocalSkillFixture({
      siblingSkills: [{ name: "sibling-skill" }, { name: "manual-sibling", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");
    const sibling = (name: string) => ({
      skillName: name,
      skillPath: path.join(repoRoot, ".agents", "skills", name),
    });

    const deployment = await stageDeployment(
      deploymentOptions(target, {
        plugins: [{ pluginName: "demo", pluginPath: path.join(pluginRepoRoot, "plugins", "demo") }],
        repoLocalSkills: [sibling("sibling-skill"), sibling("manual-sibling")],
      }),
    );

    expect([...deployment.stagedSkillLabels].sort()).toStrictEqual([
      "auto-skill",
      "demo:auto-skill",
      "demo:manual-skill",
      "manual-sibling",
      "sibling-skill",
    ]);
    expect(deployment.invocableSkills).toStrictEqual([
      { skillLabel: "demo:auto-skill", pluginName: "demo", skillName: "auto-skill" },
      { skillLabel: "auto-skill", skillName: "auto-skill" },
      { skillLabel: "sibling-skill", skillName: "sibling-skill" },
    ]);
  });

  it("watches a manual-only repo-local target, as a forced run needs", async () => {
    const repoRoot = await writeRepoLocalSkillFixture({
      siblingSkills: [{ name: "manual-sibling", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");
    await writeFile(
      target.skillFilePath,
      "---\nname: auto-skill\ndisable-model-invocation: true\n---\n",
    );

    const deployment = await stageDeployment(
      deploymentOptions(target, {
        repoLocalSkills: [
          {
            skillName: "manual-sibling",
            skillPath: path.join(repoRoot, ".agents", "skills", "manual-sibling"),
          },
        ],
      }),
    );

    expect(deployment.invocableSkills.map((skill) => skill.skillLabel)).toStrictEqual([
      "auto-skill",
    ]);
  });

  it("stages repo-local skills byte-identical on the lane's surface", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");

    const deployment = await stageDeployment(
      deploymentOptions(target, { repoLocalSurface: ".claude" }),
    );

    await expect(
      readFile(
        path.join(deployment.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toBe(await readFile(target.skillFilePath, "utf8"));
  });

  it("never stages repo-local skills for a plugin target", async () => {
    const repoRoot = await writeRepoFixture();
    const localRepoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(
      deploymentOptions(target, {
        repoLocalSkills: [
          {
            skillName: "auto-skill",
            skillPath: path.join(localRepoRoot, ".agents", "skills", "auto-skill"),
          },
        ],
      }),
    );

    expect([...deployment.stagedSkillLabels]).toStrictEqual(["demo:auto-skill"]);
    await expect(stat(path.join(deployment.workspacePath, ".agents"))).rejects.toThrow("ENOENT");
  });

  it("reads every staged skill's applied skills from its trigger fixture", async () => {
    const pluginRepoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "helper-skill" }, { name: "excluded-skill" }],
    });
    const pluginTarget = path.join(pluginRepoRoot, "plugins", "demo", "skills", "auto-skill");
    // The body names two siblings, but only the declared one is an applied skill: a body may name
    // a skill to exclude it.
    await writeFile(
      path.join(pluginTarget, "SKILL.md"),
      "---\nname: auto-skill\n---\nApply `helper-skill`. Not for `excluded-skill` requests.\n",
    );
    await writeFile(
      path.join(pluginTarget, "evals", "triggers.yaml"),
      `applies:\n  - demo:helper-skill\n${triggerFixtureYaml()}`,
    );
    const repoRoot = await writeRepoLocalSkillFixture({
      siblingSkills: [{ name: "sibling-skill" }],
    });
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");
    await writeFile(
      path.join(target.skillPath, "evals", "triggers.yaml"),
      `applies:\n  - sibling-skill\n${triggerFixtureYaml()}`,
    );

    const deployment = await stageDeployment(
      deploymentOptions(target, {
        plugins: [{ pluginName: "demo", pluginPath: path.join(pluginRepoRoot, "plugins", "demo") }],
        repoLocalSkills: [
          {
            skillName: "sibling-skill",
            skillPath: path.join(repoRoot, ".agents", "skills", "sibling-skill"),
          },
        ],
      }),
    );

    expect(deployment.skillDependencies.get("demo:auto-skill")).toStrictEqual(
      new Set(["demo:helper-skill"]),
    );
    expect(deployment.skillDependencies.get("auto-skill")).toStrictEqual(
      new Set(["sibling-skill"]),
    );
    // A skill without a fixture applies nothing.
    expect(deployment.skillDependencies.get("sibling-skill")).toBeUndefined();
  });

  it("tracks the workspace root on the runtime so a release removes it", async () => {
    const repoRoot = await writeRepoFixture();
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");
    const runtime = createRuntimeResources();

    const deployment = await stageDeployment(deploymentOptions(target, { runtime }));
    await expect(runtime.release()).resolves.toStrictEqual([]);

    await expect(stat(deployment.workspaceRoot)).rejects.toThrow("ENOENT");
  });
});
