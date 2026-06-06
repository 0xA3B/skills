import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSkillTarget } from "./target.js";

describe("resolveSkillTarget", () => {
  it("accepts repo plugin skill paths", () => {
    const repoRoot = "/repo";

    expect(
      resolveSkillTarget(repoRoot, "codex_plugins/conventional-commits/skills/commit"),
    ).toMatchObject({
      kind: "plugin",
      repoRoot,
      pluginName: "conventional-commits",
      skillName: "commit",
      pluginPath: path.join(repoRoot, "codex_plugins", "conventional-commits"),
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
