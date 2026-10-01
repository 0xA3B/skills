import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type PluginSkill, resolveSkill } from "../../src/skills/index.js";
import {
  appendStagedSkillCanaries,
  createStagedWorkspace,
  pluginsToStage,
  stagedSkillFilePath,
  stagePluginCopies,
  surveySkillDependencies,
  surveyStagedSkills,
} from "../../src/trigger-evals/staging.js";
import { writeRepoFixture, writeRepoLocalSkillFixture } from "./test-utils.js";

async function pluginTarget(repoRoot: string): Promise<PluginSkill> {
  const target = resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");
  if (target.kind !== "plugin") {
    throw new Error("expected a plugin target");
  }
  return target;
}

describe("surveyStagedSkills", () => {
  it("canaries every implicitly invokable staged skill and labels all of them", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "sibling-skill" }, { name: "manual-skill", manualOnly: true }],
    });
    const target = await pluginTarget(repoRoot);

    const survey = await surveyStagedSkills(target, pluginsToStage(target, []));

    expect(survey.stagedSkillLabels.sort()).toStrictEqual([
      "demo:auto-skill",
      "demo:manual-skill",
      "demo:sibling-skill",
    ]);
    expect(survey.skillCanaries.map((skillCanary) => skillCanary.skillLabel).sort()).toStrictEqual([
      "demo:auto-skill",
      "demo:sibling-skill",
    ]);
  });

  it("gives repo-local targets no canary exception: staged plugin skills follow their policy", async () => {
    const pluginRepoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkill(repoRoot, ".agents/skills/auto-skill");

    // A repo-local target owns no plugin, so exactly the extra entries stage.
    const entries = pluginsToStage(target, [
      { pluginName: "demo", pluginPath: path.join(pluginRepoRoot, "plugins", "demo") },
    ]);
    const survey = await surveyStagedSkills(target, entries);

    expect(entries.map((entry) => entry.pluginName)).toStrictEqual(["demo"]);
    expect(survey.stagedSkillLabels.sort()).toStrictEqual(["demo:auto-skill", "demo:manual-skill"]);
    expect(survey.skillCanaries.map((skillCanary) => skillCanary.skillLabel)).toStrictEqual([
      "demo:auto-skill",
    ]);
  });
});

describe("stagePluginCopies", () => {
  it("copies plugins into the workspace and appended canaries stay out of manual-only skills", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();
    const entries = pluginsToStage(target, []);

    await stagePluginCopies(workspacePath, entries);
    const survey = await surveyStagedSkills(target, entries);
    await appendStagedSkillCanaries(workspacePath, survey.skillCanaries);

    const stagedTarget = await readFile(stagedSkillFilePath(workspacePath, target), "utf8");
    expect(stagedTarget).toContain("Trigger Eval Instructions");
    // Body-only injection: the frontmatter description under test stays untouched.
    expect(stagedTarget).not.toContain("Eval only:");
    const stagedManual = await readFile(
      path.join(workspacePath, "plugins", "demo", "skills", "manual-skill", "SKILL.md"),
      "utf8",
    );
    expect(stagedManual).not.toContain("Trigger Eval Instructions");
  });

  it("resolves plugin versions from the portable manifest before the Claude extension", async () => {
    const repoRoot = await writeRepoFixture({ portableVersion: "3.0.0" });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();

    const stagedPlugins = await stagePluginCopies(workspacePath, pluginsToStage(target, []));

    expect(stagedPlugins).toStrictEqual([
      { pluginName: "demo", sourcePath: target.pluginPath, version: "3.0.0" },
    ]);
  });

  it("resolves plugin versions from the Claude extension when no portable manifest ships", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();

    const stagedPlugins = await stagePluginCopies(workspacePath, pluginsToStage(target, []));

    expect(stagedPlugins).toStrictEqual([
      { pluginName: "demo", sourcePath: target.pluginPath, version: "1.0.0" },
    ]);
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
