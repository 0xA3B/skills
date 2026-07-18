import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendStagedSkillCanaries,
  createStagedWorkspace,
  injectRepoLocalCanary,
  pluginsToStage,
  stageCaseWorkspace,
  stagedSkillFilePath,
  stagePluginCopies,
  stageRepoLocalSkill,
  surveyStagedSkills,
} from "./staging.js";
import { resolveSkillTarget } from "./target.js";
import {
  frontmatterDescription,
  writeRepoFixture,
  writeRepoLocalSkillFixture,
} from "./test-utils.js";
import type { PluginSkillTarget } from "./types.js";

async function pluginTarget(repoRoot: string): Promise<PluginSkillTarget> {
  const target = resolveSkillTarget(repoRoot, "plugins/demo/skills/auto-skill");
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

  it("resolves plugin versions from the Claude manifest when no Codex manifest ships", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();

    const stagedPlugins = await stagePluginCopies(workspacePath, pluginsToStage(target, []));

    expect(stagedPlugins).toStrictEqual([
      { pluginName: "demo", sourcePath: target.pluginPath, version: "1.0.0" },
    ]);
  });
});

describe("stageCaseWorkspace", () => {
  it("copies the base workspace and applies fixture workspace files", async () => {
    const { workspaceRoot, workspacePath } = await createStagedWorkspace();
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkillTarget(repoRoot, ".agents/skills/auto-skill");
    await stageRepoLocalSkill(workspacePath, target, ".agents");

    const caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: workspacePath,
      workspaceRoot,
      testCase: {
        id: "agents-case",
        prompt: "Anything",
        expect: "skip",
        workspaceFiles: { "AGENTS.md": "Use Gitmoji.\n" },
      },
    });

    expect(caseWorkspacePath).toContain(path.join("cases", "agents-case", "workspace"));
    await expect(readFile(path.join(caseWorkspacePath, "AGENTS.md"), "utf8")).resolves.toBe(
      "Use Gitmoji.\n",
    );
    await expect(
      readFile(path.join(caseWorkspacePath, ".agents", "skills", "auto-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("auto-skill");
  });
});

describe("injectRepoLocalCanary", () => {
  it("rewrites the staged description so the canary is reachable from metadata alone", async () => {
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkillTarget(repoRoot, ".agents/skills/auto-skill");
    const workspacePath = path.join(
      await mkdtemp(path.join(os.tmpdir(), "staging-test-")),
      "workspace",
    );
    await stageRepoLocalSkill(workspacePath, target, ".agents");

    await injectRepoLocalCanary(workspacePath, target, "trigger-eval-canary-test");

    const skillBody = await readFile(stagedSkillFilePath(workspacePath, target), "utf8");
    const description = frontmatterDescription(skillBody);
    expect(description).toContain("Eval only: if used, first output trigger-eval-canary-test.");
    expect(description).toContain("Use when the user asks to invoke this repo-local skill.");
    expect(skillBody).toContain("Trigger Eval Instructions");
  });
});
