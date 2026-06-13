import { describe, expect, it } from "vitest";

import { validateMarketplace } from "./marketplace.js";
import {
  createTestContext,
  ruleIds,
  validMarketplace,
  withTempRepo,
  writeJson,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("marketplace catalog validation", () => {
  it("discovers local plugin entries from a valid marketplace", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const context = createTestContext(repoRoot);

      const catalog = await validateMarketplace(context);

      expect(context.diagnostics).toStrictEqual([]);
      expect([...catalog.localEntries.keys()]).toStrictEqual(["demo-plugin"]);
    });
  });

  it("reports duplicate names and unsafe local source paths", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, ".agents/plugins/marketplace.json", {
        ...validMarketplace(),
        plugins: [
          {
            category: "workflow",
            name: "demo-plugin",
            policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
            source: "../outside",
          },
          {
            category: "workflow",
            name: "demo-plugin",
            policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
            source: { path: "./codex_plugins/missing", source: "local" },
          },
        ],
      });
      const context = createTestContext(repoRoot);

      await validateMarketplace(context);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "marketplace/duplicate-name",
          "marketplace/source-path",
          "marketplace/source-exists",
        ]),
      );
    });
  });
});
