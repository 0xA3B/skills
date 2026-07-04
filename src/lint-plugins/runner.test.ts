import { rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { lintPlugins, runLintPlugins } from "./runner.js";
import {
  ruleIds,
  validMarketplace,
  withTempRepo,
  writeJson,
  writeText,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("lint runner", () => {
  it("returns a clean result for a valid local plugin marketplace", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.catalog.localEntries.size).toBe(1);
    });
  });

  it("reports repo-required OpenAI metadata through the result object", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await rm(path.join(repoRoot, "plugins/demo-plugin/skills/hello/agents/openai.yaml"));

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("repo/openai-metadata-required");
    });
  });

  it("reports parse errors for malformed manifests that are not listed in the marketplace", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        ".agents/plugins/marketplace.json",
        validMarketplace({ plugins: [] }),
      );
      await writeText(repoRoot, "plugins/broken/.codex-plugin/plugin.json", "{");

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(2);
      expect(ruleIds(result.context)).toStrictEqual(
        expect.arrayContaining(["coverage/manifest-listed", "parse/json"]),
      );
    });
  });

  it("writes warning-only CLI output to stdout", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        marketplace: validMarketplace({
          plugins: [
            {
              category: "workflow",
              name: "demo-plugin",
              policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
              source: "./plugins/./demo-plugin",
            },
          ],
        }),
      });
      const previousExitCode = process.exitCode;
      const log = vi.spyOn(console, "log").mockReturnValue(undefined);
      const error = vi.spyOn(console, "error").mockReturnValue(undefined);

      try {
        await runLintPlugins({ repoRoot });

        expect(error).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith("Plugin lint completed with 0 error(s) and 1 warning(s):");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("WARNING alignment/source-path"));
      } finally {
        log.mockRestore();
        error.mockRestore();
        process.exitCode = previousExitCode;
      }
    });
  });
});
