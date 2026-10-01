import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import {
  listPluginSkills,
  listRepoLocalSkills,
  parseSkillLabel,
  resolveSkill,
  resolveSkillLabel,
  formatSkillLabel,
} from "../../src/skills/index.js";

async function tempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "skills-layout-"));
  onTestFinished(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function writeSkill(skillPath: string): Promise<void> {
  await mkdir(skillPath, { recursive: true });
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: skill\n---\n");
}

describe("resolveSkill", () => {
  it("accepts repo plugin skill paths", () => {
    const repoRoot = "/repo";

    expect(resolveSkill(repoRoot, "plugins/git/skills/commit")).toMatchObject({
      kind: "plugin",
      repoRoot,
      pluginName: "git",
      skillName: "commit",
      pluginPath: path.join(repoRoot, "plugins", "git"),
    });
  });

  it("accepts repo-local skill paths", () => {
    const repoRoot = "/repo";

    expect(resolveSkill(repoRoot, ".agents/skills/add-skill")).toMatchObject({
      kind: "repo-local",
      repoRoot,
      skillName: "add-skill",
      skillPath: path.join(repoRoot, ".agents", "skills", "add-skill"),
      fixturePath: path.join(repoRoot, ".agents", "skills", "add-skill", "evals", "triggers.yaml"),
    });
  });

  it("rejects unsupported skill paths", () => {
    expect(() => resolveSkill("/repo", ".codex/skills/optimize-trigger")).toThrow(
      "Expected a skill path like",
    );
  });
});

describe("skill labels", () => {
  it("labels a plugin skill with its plugin and a repo-local skill by bare name", () => {
    expect(formatSkillLabel(resolveSkill("/repo", "plugins/git/skills/commit"))).toBe("git:commit");
    expect(formatSkillLabel(resolveSkill("/repo", ".agents/skills/add-skill"))).toBe("add-skill");
  });

  it("parses a label back into its plugin and skill names", () => {
    expect(parseSkillLabel("git:commit")).toStrictEqual({
      pluginName: "git",
      skillName: "commit",
    });
    expect(parseSkillLabel("add-skill")).toStrictEqual({ skillName: "add-skill" });
  });

  it.each(["git:commit", "add-skill"])("resolves the skill %s names", (label) => {
    expect(formatSkillLabel(resolveSkillLabel("/repo", label))).toBe(label);
  });
});

describe("skill listing", () => {
  it("lists only non-dot directories that hold a SKILL.md, sorted by name", async () => {
    const repoRoot = await tempRepo();
    const skillsRoot = path.join(repoRoot, "plugins", "demo", "skills");
    await writeSkill(path.join(skillsRoot, "zeta"));
    await writeSkill(path.join(skillsRoot, "alpha"));
    await writeSkill(path.join(skillsRoot, ".cc-writes"));
    await mkdir(path.join(skillsRoot, "no-skill-file"), { recursive: true });
    await writeFile(path.join(skillsRoot, "stray-file"), "not a skill");

    await expect(listPluginSkills(path.join(repoRoot, "plugins", "demo"))).resolves.toStrictEqual([
      { skillName: "alpha", skillPath: path.join(skillsRoot, "alpha") },
      { skillName: "zeta", skillPath: path.join(skillsRoot, "zeta") },
    ]);
  });

  it("applies the same rule to repo-local skills and resolves each one", async () => {
    const repoRoot = await tempRepo();
    const skillsRoot = path.join(repoRoot, ".agents", "skills");
    await writeSkill(path.join(skillsRoot, "zeta-skill"));
    await writeSkill(path.join(skillsRoot, "alpha-skill"));
    await writeSkill(path.join(skillsRoot, ".scratch"));
    await mkdir(path.join(skillsRoot, "empty-dir"), { recursive: true });

    const skills = await listRepoLocalSkills(repoRoot);

    expect(skills.map((skill) => formatSkillLabel(skill))).toStrictEqual([
      "alpha-skill",
      "zeta-skill",
    ]);
    expect(skills[0]).toMatchObject({
      kind: "repo-local",
      skillFilePath: path.join(skillsRoot, "alpha-skill", "SKILL.md"),
    });
  });

  it("lists no skills when the skills root is missing", async () => {
    const repoRoot = await tempRepo();

    await expect(listPluginSkills(path.join(repoRoot, "plugins", "demo"))).resolves.toStrictEqual(
      [],
    );
    await expect(listRepoLocalSkills(repoRoot)).resolves.toStrictEqual([]);
  });
});
