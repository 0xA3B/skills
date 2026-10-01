import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";
import { YAMLParseError } from "yaml";

import { readAllowImplicitInvocation, resolveSkill, type Skill } from "../../src/skills/index.js";

describe("readAllowImplicitInvocation", () => {
  async function writeSkillFixture(options: {
    skillMarkdown?: string;
    openAiYaml?: string;
  }): Promise<Skill> {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "skills-policy-"));
    onTestFinished(() => rm(repoRoot, { force: true, recursive: true }));
    const skillPath = path.join(repoRoot, "plugins", "demo", "skills", "auto-skill");
    await mkdir(skillPath, { recursive: true });
    await writeFile(
      path.join(skillPath, "SKILL.md"),
      options.skillMarkdown ?? "---\nname: auto-skill\n---\n",
    );
    if (options.openAiYaml !== undefined) {
      await mkdir(path.join(skillPath, "agents"), { recursive: true });
      await writeFile(path.join(skillPath, "agents", "openai.yaml"), options.openAiYaml);
    }

    return resolveSkill(repoRoot, "plugins/demo/skills/auto-skill");
  }

  it("reads the Claude policy from SKILL.md frontmatter without Codex metadata", async () => {
    const skill = await writeSkillFixture({});

    await expect(readAllowImplicitInvocation(skill, "claude")).resolves.toBe(true);
  });

  it.each(["\n", "\r\n", "\r"])(
    "reads manual-only frontmatter with %j line endings",
    async (newline) => {
      const skill = await writeSkillFixture({
        skillMarkdown: [
          "---",
          "name: auto-skill",
          "disable-model-invocation: true",
          "---",
          "# Skill",
        ].join(newline),
      });

      await expect(readAllowImplicitInvocation(skill, "claude")).resolves.toBe(false);
    },
  );

  it("reads the Codex policy from agents/openai.yaml", async () => {
    const skill = await writeSkillFixture({
      skillMarkdown: "---\ndisable-model-invocation: true\n---\n",
      openAiYaml: "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
    });

    await expect(readAllowImplicitInvocation(skill, "codex")).resolves.toBe(true);
  });

  it.each([
    "# No frontmatter\n",
    "# Body\n---\ndisable-model-invocation: true\n---\n",
    "---\ndisable-model-invocation: true\n",
    "---\n---\n# Empty frontmatter\n",
    "---\n- a list\n---\n",
  ])("keeps the Claude default for absent or non-object frontmatter: %j", async (skillMarkdown) => {
    const skill = await writeSkillFixture({ skillMarkdown });

    await expect(readAllowImplicitInvocation(skill, "claude")).resolves.toBe(true);
  });

  it("surfaces malformed YAML instead of treating it as implicit invocation", async () => {
    const skill = await writeSkillFixture({
      skillMarkdown: "---\nname: [unclosed\n---\n# Skill\n",
    });

    await expect(readAllowImplicitInvocation(skill, "claude")).rejects.toThrow(YAMLParseError);
  });

  it("explains missing Codex metadata instead of surfacing a raw read error", async () => {
    const skill = await writeSkillFixture({});

    await expect(readAllowImplicitInvocation(skill, "codex")).rejects.toThrow(
      "Codex trigger evals require agents/openai.yaml",
    );
  });
});
