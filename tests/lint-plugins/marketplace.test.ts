import { describe, expect, it } from "vitest";

import { validateMarketplace } from "../../src/lint-plugins/marketplace.js";
import {
  createTestContext,
  validMarketplace,
  withTempRepo,
  writeJson,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("marketplace catalog validation", () => {
  it.each(["url", "git-subdir"])("rejects unsupported remote %s sources", async (source) => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, ".agents/plugins/marketplace.json", {
        ...validMarketplace(),
        plugins: [
          {
            category: "workflow",
            name: "remote-plugin",
            policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
            source: { source, url: "https://example.com/plugins.git", path: "./plugins/demo" },
          },
        ],
      });
      const context = createTestContext(repoRoot);

      const catalog = await validateMarketplace(context);

      expect(context.diagnostics).toStrictEqual([
        expect.objectContaining({
          ruleId: "marketplace/source-type",
          severity: "error",
          pointer: "/plugins/0/source/source",
          message: 'Only local plugin sources are supported; expected source.source to be "local".',
        }),
      ]);
      expect(catalog.localEntries).toStrictEqual([]);
    });
  });

  it.each([
    { source: "./plugins/demo-plugin" },
    { source: { source: "local", path: "./plugins/demo-plugin" } },
  ])("discovers local plugin entries from source $source", async ({ source }) => {
    await withTempRepo(async (repoRoot) => {
      const marketplace = validMarketplace();
      marketplace.plugins[0]!.source = source;
      await writeValidPluginRepo(repoRoot, { marketplace });
      const context = createTestContext(repoRoot);

      const catalog = await validateMarketplace(context);

      expect(context.diagnostics).toStrictEqual([]);
      expect(catalog.localEntries.map((entry) => entry.name)).toStrictEqual(["demo-plugin"]);
    });
  });
});
