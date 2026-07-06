import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readAllowImplicitInvocation, resolveSkillTarget } from "./target.js";

describe("resolveSkillTarget", () => {
  it("accepts repo plugin skill paths", () => {
    const repoRoot = "/repo";

    expect(
      resolveSkillTarget(repoRoot, "plugins/conventional-commits/skills/commit"),
    ).toMatchObject({
      kind: "plugin",
      repoRoot,
      pluginName: "conventional-commits",
      skillName: "commit",
      pluginPath: path.join(repoRoot, "plugins", "conventional-commits"),
    });
  });

  it("accepts repo-local skill paths", () => {
    const repoRoot = "/repo";

    expect(resolveSkillTarget(repoRoot, ".agents/skills/add-skill")).toMatchObject({
      kind: "repo-local",
      repoRoot,
      skillName: "add-skill",
      skillPath: path.join(repoRoot, ".agents", "skills", "add-skill"),
    });
  });

  it("rejects unsupported skill paths", () => {
    expect(() => resolveSkillTarget("/repo", ".codex/skills/optimize-trigger")).toThrow(
      "Expected a skill path like",
    );
  });
});

describe("readAllowImplicitInvocation", () => {
  async function writeSkillFixture(options: {
    skillMarkdown?: string;
    openAiYaml?: string;
  }): Promise<ReturnType<typeof resolveSkillTarget>> {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-target-"));
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

    return resolveSkillTarget(repoRoot, "plugins/demo/skills/auto-skill");
  }

  it("reads the Claude policy from SKILL.md frontmatter without Codex metadata", async () => {
    const target = await writeSkillFixture({});

    await expect(readAllowImplicitInvocation(target, "claude")).resolves.toBe(true);
  });

  it("treats disable-model-invocation as manual-only on the Claude lane", async () => {
    const target = await writeSkillFixture({
      skillMarkdown: "---\nname: auto-skill\ndisable-model-invocation: true\n---\n",
    });

    await expect(readAllowImplicitInvocation(target, "claude")).resolves.toBe(false);
  });

  it("reads the Codex policy from agents/openai.yaml", async () => {
    const target = await writeSkillFixture({
      openAiYaml: "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
    });

    await expect(readAllowImplicitInvocation(target, "codex")).resolves.toBe(true);
  });

  it("explains missing Codex metadata instead of surfacing a raw read error", async () => {
    const target = await writeSkillFixture({});

    await expect(readAllowImplicitInvocation(target, "codex")).rejects.toThrow(
      "Codex trigger evals require agents/openai.yaml",
    );
  });
});
