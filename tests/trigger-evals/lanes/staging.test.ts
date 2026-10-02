import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSkill, type Skill } from "../../../src/skills/index.js";
import {
  type DeploymentOptions,
  stageDeployment,
  surveySkillDependencies,
} from "../../../src/trigger-evals/lanes/staging.js";
import { createRuntimeResources } from "../../../src/trigger-evals/runtime.js";
import { writeRepoFixture, writeRepoLocalSkillFixture } from "../test-utils.js";

function deploymentOptions(
  target: Skill,
  overrides: Partial<DeploymentOptions> = {},
): DeploymentOptions {
  return {
    target,
    plugins: [],
    repoLocalSkills: [],
    repoLocalSurface: ".agents",
    canaryRepoLocalSkills: true,
    runtime: createRuntimeResources(),
    ...overrides,
  };
}

function stagedPluginSkill(deploymentPath: string, pluginName: string, skillName: string): string {
  return path.join(deploymentPath, "plugins", pluginName, "skills", skillName, "SKILL.md");
}

describe("stageDeployment", () => {
  it("labels every staged plugin skill and canaries the target and implicit siblings", async () => {
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
    expect(deployment.canaries.map((canary) => canary.skillLabel)).toStrictEqual([
      "demo:auto-skill",
      "demo:sibling-skill",
    ]);
  });

  it("canaries a manual-only plugin target, as a forced run needs", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");
    await writeFile(
      target.skillFilePath,
      "---\nname: auto-skill\ndisable-model-invocation: true\n---\n",
    );

    const deployment = await stageDeployment(deploymentOptions(target));

    expect(deployment.canaries.map((canary) => canary.skillLabel)).toStrictEqual([
      "demo:auto-skill",
    ]);
  });

  it("appends each canary to the staged body only, leaving committed skills untouched", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");

    const deployment = await stageDeployment(deploymentOptions(target));

    const [targetCanary] = deployment.canaries;
    const stagedTarget = await readFile(
      stagedPluginSkill(deployment.deploymentPath, "demo", "auto-skill"),
      "utf8",
    );
    expect(stagedTarget).toContain(targetCanary?.canary);
    // Body-only injection: the frontmatter description under test stays untouched.
    expect(stagedTarget).not.toContain("Eval only:");
    await expect(
      readFile(stagedPluginSkill(deployment.deploymentPath, "demo", "manual-skill"), "utf8"),
    ).resolves.not.toContain("Trigger Eval Instructions");
    await expect(readFile(target.skillFilePath, "utf8")).resolves.not.toContain(
      "Trigger Eval Instructions",
    );
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

  it("gives a repo-local target no exception for plugin skills and canaries implicit siblings", async () => {
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
    expect(deployment.canaries.map((canary) => canary.skillLabel)).toStrictEqual([
      "demo:auto-skill",
      "auto-skill",
      "sibling-skill",
    ]);
    // Repo-local canaries land in the base workspace, so every case copy carries them.
    const [, targetCanary] = deployment.canaries;
    await expect(
      readFile(
        path.join(deployment.workspacePath, ".agents", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toContain(targetCanary?.canary);
  });

  it("canaries a manual-only repo-local target, as a forced run needs", async () => {
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

    expect(deployment.canaries.map((canary) => canary.skillLabel)).toStrictEqual(["auto-skill"]);
  });

  it("stages repo-local skills on the lane's surface without canaries when the lane opts out", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");

    const deployment = await stageDeployment(
      deploymentOptions(target, { repoLocalSurface: ".claude", canaryRepoLocalSkills: false }),
    );

    expect(deployment.canaries).toStrictEqual([]);
    await expect(
      readFile(
        path.join(deployment.workspacePath, ".claude", "skills", "auto-skill", "SKILL.md"),
        "utf8",
      ),
    ).resolves.not.toContain("Trigger Eval Instructions");
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

  it("surveys the dependencies of every staged plugin and repo-local skill", async () => {
    const pluginRepoRoot = await writeRepoFixture({ siblingSkills: [{ name: "helper-skill" }] });
    await writeFile(
      path.join(pluginRepoRoot, "plugins", "demo", "skills", "auto-skill", "SKILL.md"),
      "---\nname: auto-skill\n---\nApply `helper-skill` first.\n",
    );
    const repoRoot = await writeRepoLocalSkillFixture({
      siblingSkills: [{ name: "sibling-skill" }],
    });
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");
    await writeFile(
      target.skillFilePath,
      "---\nname: auto-skill\n---\nThen run `sibling-skill`.\n",
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

describe("surveySkillDependencies", () => {
  it("names the staged skills a body references by label or same-plugin bare name", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skill-deps-"));
    const write = async (name: string, body: string) => {
      const file = path.join(dir, `${name}.md`);
      await writeFile(file, body);
      return file;
    };
    const skillFiles = [
      {
        skillLabel: "demo:review",
        pluginName: "demo",
        skillName: "review",
        filePath: await write(
          "review",
          "Use the `cli` skill for mechanics and apply `writing:style` to the prompt.",
        ),
      },
      {
        skillLabel: "demo:cli",
        pluginName: "demo",
        skillName: "cli",
        filePath: await write("cli", "Run the CLI. Mentions $writing:style in the default prompt."),
      },
      {
        skillLabel: "writing:style",
        pluginName: "writing",
        skillName: "style",
        filePath: await write("style", "House style. Mentions the word review and cli in prose."),
      },
      {
        skillLabel: "local-skill",
        skillName: "local-skill",
        filePath: await write(
          "local",
          "Repo-local: apply `style`? No: cross-plugin needs the label.",
        ),
      },
    ];

    const dependencies = await surveySkillDependencies(skillFiles);

    expect(dependencies.get("demo:review")).toStrictEqual(new Set(["demo:cli", "writing:style"]));
    expect(dependencies.get("demo:cli")).toStrictEqual(new Set(["writing:style"]));
    // Bare words in prose are not references; only backticked names count.
    expect(dependencies.get("writing:style")).toStrictEqual(new Set());
    // A bare name reaches only same-plugin siblings, so `style` does not resolve cross-plugin.
    expect(dependencies.get("local-skill")).toStrictEqual(new Set());
  });

  it("does not credit a label that is only a prefix of the named skill", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skill-deps-prefix-"));
    const callerPath = path.join(dir, "caller.md");
    await writeFile(callerPath, "Prompt form: $writing:prose-style for the body.");
    const skillFiles = [
      { skillLabel: "x:caller", pluginName: "x", skillName: "caller", filePath: callerPath },
      {
        skillLabel: "writing:prose",
        pluginName: "writing",
        skillName: "prose",
        filePath: callerPath,
      },
      {
        skillLabel: "writing:prose-style",
        pluginName: "writing",
        skillName: "prose-style",
        filePath: callerPath,
      },
    ];

    const dependencies = await surveySkillDependencies(skillFiles);

    expect(dependencies.get("x:caller")).toStrictEqual(new Set(["writing:prose-style"]));
  });
});
