import { mkdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validatePluginRepository } from "../../../src/lint-plugins/repository.js";
import { validateSkills } from "../../../src/lint-plugins/skills/index.js";
import { createTestContext, ruleIds, withTempRepo, writeValidPluginRepo } from "../test-utils.js";

const bothTargets = { claude: true, codex: true };

describe("validateSkills", () => {
  // Skill names must be lowercase kebab-case matching the directory, so a dot-prefixed directory
  // is never a skill; harness scratch directories such as .claude/.cc-writes land there when a
  // shell runs inside skills/.
  it("ignores dot-prefixed directories under skills/", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const skillsPath = path.join(repoRoot, "plugins", "demo-plugin", "skills");
      await mkdir(path.join(skillsPath, ".claude", ".cc-writes"), { recursive: true });
      const context = createTestContext(repoRoot);

      const repository = await validatePluginRepository(createTestContext(repoRoot));
      await validateSkills(context, skillsPath, bothTargets, repository.missingTargets);

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  it("does not count a dot-prefixed directory as a skill for the non-empty check", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillsPath = path.join(repoRoot, "plugins", "demo-plugin", "skills");
      await mkdir(path.join(skillsPath, ".hidden"), { recursive: true });
      const context = createTestContext(repoRoot);

      const repository = await validatePluginRepository(createTestContext(repoRoot));
      await validateSkills(context, skillsPath, bothTargets, repository.missingTargets);

      expect(ruleIds(context)).toStrictEqual(["skills/non-empty"]);
    });
  });
});
