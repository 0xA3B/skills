import { describe, expect, it } from "vitest";

import {
  validateClaudeMarketplace,
  validateClaudeRepositoryAlignment,
} from "./claude-marketplace.js";
import {
  createTestContext,
  ruleIds,
  validClaudeMarketplace,
  withTempRepo,
  writeJson,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("Claude marketplace validation", () => {
  it("accepts a valid Claude marketplace with in-repo plugin sources", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const context = createTestContext(repoRoot);

      const catalog = await validateClaudeMarketplace(context);

      expect(context.diagnostics).toStrictEqual([]);
      expect(catalog.present).toBe(true);
      expect(catalog.localEntries.size).toBe(1);
      expect(catalog.localEntries.get("demo-plugin")?.sourcePath).toBe("./plugins/demo-plugin");
    });
  });

  it("returns an absent catalog without diagnostics when the file is missing", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      const catalog = await validateClaudeMarketplace(context);

      expect(context.diagnostics).toStrictEqual([]);
      expect(catalog.present).toBe(false);
      expect(catalog.localEntries.size).toBe(0);
    });
  });

  it("reports unsupported keys, owner problems, and duplicate plugin names", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeMarketplace: false });
      await writeJson(
        repoRoot,
        ".claude-plugin/marketplace.json",
        validClaudeMarketplace({
          metadata: { pluginRoot: "./plugins" },
          owner: { handle: "someone" },
          plugins: [
            { name: "demo-plugin", source: "./plugins/demo-plugin" },
            { name: "demo-plugin", source: "./plugins/demo-plugin" },
          ],
        }),
      );
      const context = createTestContext(repoRoot);

      await validateClaudeMarketplace(context);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "claude-marketplace/root-key",
          "claude-marketplace/owner-key",
          "schema/string",
          "claude-marketplace/duplicate-name",
        ]),
      );
    });
  });

  it("requires local sources that resolve to plugins with Claude manifests", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeManifest: false, claudeMarketplace: false });
      await writeJson(
        repoRoot,
        ".claude-plugin/marketplace.json",
        validClaudeMarketplace({
          plugins: [
            { name: "demo-plugin", source: "./plugins/demo-plugin" },
            { name: "missing-plugin", source: "./plugins/missing-plugin" },
            { name: "remote-plugin", source: { repo: "owner/repo", source: "github" } },
          ],
        }),
      );
      const context = createTestContext(repoRoot);

      const catalog = await validateClaudeMarketplace(context);

      expect(catalog.localEntries.size).toBe(0);
      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "claude-marketplace/source-manifest",
          "claude-marketplace/source-exists",
          "claude-marketplace/source",
        ]),
      );
    });
  });

  it("warns when a local source path strays from the plugins directory convention", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const context = createTestContext(repoRoot);
      const catalog = await validateClaudeMarketplace(context);
      const entry = catalog.localEntries.get("demo-plugin");
      if (entry === undefined) {
        throw new Error("Expected demo-plugin entry.");
      }
      entry.sourcePath = "./plugins/./demo-plugin";

      validateClaudeRepositoryAlignment(context, catalog);

      expect(ruleIds(context)).toStrictEqual(["alignment/source-path"]);
    });
  });
});
