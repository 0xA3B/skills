import { describe, expect, it } from "vitest";

import { validatePlugin } from "./plugin-manifest.js";
import {
  createTestContext,
  ruleIds,
  validLocalCatalogEntry,
  validPluginManifest,
  withTempRepo,
  writeJson,
} from "./test-utils.js";

describe("plugin manifest validation", () => {
  it("accepts a Codex plugin manifest with skills path and interface metadata", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, "codex_plugins/demo-plugin/.codex-plugin/plugin.json", {
        ...validPluginManifest(),
        interface: {
          capabilities: ["skills"],
          category: "workflow",
          developerName: "Test Developer",
          displayName: "Demo Plugin",
          longDescription: "Long description",
          shortDescription: "Short description",
        },
      });
      await writeJson(repoRoot, "codex_plugins/demo-plugin/skills/.keep", {});
      const context = createTestContext(repoRoot);

      await validatePlugin(context, validLocalCatalogEntry(repoRoot));

      expect(context.diagnostics).toEqual([]);
    });
  });

  it("reports repo alignment and path kind problems", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, "codex_plugins/demo-plugin/.codex-plugin/plugin.json", {
        ...validPluginManifest(),
        interface: {
          brandColor: "blue",
          capabilities: [],
          category: "wrong-category",
          developerName: "Test Developer",
          displayName: "Demo Plugin",
          longDescription: "Long description",
          shortDescription: "Short description",
        },
        name: "other-plugin",
        skills: "../outside",
      });
      const context = createTestContext(repoRoot);

      await validatePlugin(context, validLocalCatalogEntry(repoRoot));

      expect(ruleIds(context)).toEqual(
        expect.arrayContaining([
          "alignment/name",
          "alignment/directory-name",
          "alignment/category",
          "schema/string-array",
          "manifest/brand-color",
          "manifest/path",
        ]),
      );
    });
  });

  it("reports plugin default prompt arrays that exceed the Codex UI limit", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, "codex_plugins/demo-plugin/.codex-plugin/plugin.json", {
        ...validPluginManifest(),
        interface: {
          ...validPluginManifest().interface,
          defaultPrompt: [
            "Use $demo-plugin:first.",
            "Use $demo-plugin:second.",
            "Use $demo-plugin:third.",
            "Use $demo-plugin:fourth.",
          ],
        },
      });
      await writeJson(repoRoot, "codex_plugins/demo-plugin/skills/.keep", {});
      const context = createTestContext(repoRoot);

      await validatePlugin(context, validLocalCatalogEntry(repoRoot));

      expect(ruleIds(context)).toContain("manifest/default-prompt-limit");
    });
  });
});
