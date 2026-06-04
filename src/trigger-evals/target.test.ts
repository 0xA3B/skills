import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSkillTarget } from "./target.js";

describe("resolveSkillTarget", () => {
  it("accepts repo plugin skill paths", () => {
    const repoRoot = "/repo";

    expect(
      resolveSkillTarget(repoRoot, "codex_plugins/conventional-commits/skills/commit"),
    ).toMatchObject({
      repoRoot,
      pluginName: "conventional-commits",
      skillName: "commit",
      pluginPath: path.join(repoRoot, "codex_plugins", "conventional-commits"),
    });
  });

  it("rejects non-plugin skill paths", () => {
    expect(() => resolveSkillTarget("/repo", ".agents/skills/optimize-trigger")).toThrow(
      "Expected a repo plugin skill path",
    );
  });
});
