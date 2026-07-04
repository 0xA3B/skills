import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateClaudePlugin, validateDualManifestAlignment } from "./claude-plugin-manifest.js";
import {
  createTestContext,
  diagnosticByRule,
  ruleIds,
  validClaudeCatalogEntry,
  validClaudePluginManifest,
  validPluginManifest,
  withTempRepo,
  writeJson,
} from "./test-utils.js";

describe("Claude plugin manifest validation", () => {
  it("accepts a valid Claude plugin manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        "plugins/demo-plugin/.claude-plugin/plugin.json",
        validClaudePluginManifest({
          author: { name: "Test Developer" },
          homepage: "https://example.com/demo-plugin",
          keywords: ["demo"],
          license: "MIT",
          repository: "https://example.com/repo",
        }),
      );
      const context = createTestContext(repoRoot);

      const manifest = await validateClaudePlugin(context, validClaudeCatalogEntry(repoRoot));

      expect(context.diagnostics).toStrictEqual([]);
      expect(manifest?.["name"]).toBe("demo-plugin");
    });
  });

  it("rejects skills paths and unsupported manifest keys", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        "plugins/demo-plugin/.claude-plugin/plugin.json",
        validClaudePluginManifest({
          author: { handle: "someone", name: "Test Developer" },
          commands: "./commands/",
          skills: "./skills/",
        }),
      );
      const context = createTestContext(repoRoot);

      await validateClaudePlugin(context, validClaudeCatalogEntry(repoRoot));

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "claude-manifest/skills-path",
          "claude-manifest/key",
          "claude-manifest/author-key",
        ]),
      );
    });
  });

  it("reports marketplace and directory name misalignment", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        "plugins/demo-plugin/.claude-plugin/plugin.json",
        validClaudePluginManifest({ name: "other-plugin" }),
      );
      const context = createTestContext(repoRoot);

      await validateClaudePlugin(context, validClaudeCatalogEntry(repoRoot));

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining(["alignment/name", "alignment/directory-name"]),
      );
    });
  });
});

describe("dual manifest alignment", () => {
  it("requires Claude and Codex manifest versions to stay in lockstep", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);
      const manifestPath = path.join(repoRoot, "plugins/demo-plugin/.claude-plugin/plugin.json");

      validateDualManifestAlignment(
        context,
        manifestPath,
        validClaudePluginManifest({ version: "2.0.0" }),
        validPluginManifest(),
      );

      expect(ruleIds(context)).toStrictEqual(["alignment/dual-version"]);
      expect(diagnosticByRule(context, "alignment/dual-version")?.severity).toBe("error");
    });
  });

  it("warns when display names drift between harness manifests", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);
      const manifestPath = path.join(repoRoot, "plugins/demo-plugin/.claude-plugin/plugin.json");

      validateDualManifestAlignment(
        context,
        manifestPath,
        validClaudePluginManifest({ displayName: "Different Name" }),
        validPluginManifest(),
      );

      expect(ruleIds(context)).toStrictEqual(["alignment/dual-display-name"]);
      expect(diagnosticByRule(context, "alignment/dual-display-name")?.severity).toBe("warning");
    });
  });
});
