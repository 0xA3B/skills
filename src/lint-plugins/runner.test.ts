import { rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { lintPlugins, runLintPlugins } from "./runner.js";
import {
  ruleIds,
  toYaml,
  validClaudePluginManifest,
  validMarketplace,
  validOpenAiMetadata,
  validPluginManifest,
  validSkillMarkdown,
  withTempRepo,
  writeJson,
  writeText,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("lint runner", () => {
  it("returns a clean result for a valid dual-harness plugin repository", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.catalog.localEntries.size).toBe(1);
      expect(result.claudeCatalog.localEntries.size).toBe(1);
      expect(result.pluginCount).toBe(1);
    });
  });

  it("accepts Codex-only plugins that skip the Claude surfaces", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeManifest: false, claudeMarketplace: false });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.claudeCatalog.present).toBe(false);
    });
  });

  it("accepts Claude-only plugins without requiring OpenAI skill metadata", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        ".agents/plugins/marketplace.json",
        validMarketplace({ plugins: [] }),
      );
      await writeJson(repoRoot, ".claude-plugin/marketplace.json", {
        name: "test-marketplace",
        owner: { name: "Test Developer" },
        plugins: [{ name: "demo-plugin", source: "./plugins/demo-plugin" }],
      });
      await writeJson(
        repoRoot,
        "plugins/demo-plugin/.claude-plugin/plugin.json",
        validClaudePluginManifest(),
      );
      await writeText(
        repoRoot,
        "plugins/demo-plugin/skills/hello/SKILL.md",
        validSkillMarkdown({
          frontmatter: {
            description: "Use when a test needs a Claude-only skill fixture.",
            name: "hello",
          },
        }),
      );

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(ruleIds(result.context)).not.toContain("repo/openai-metadata-required");
    });
  });

  it("reports invocation policy parity drift between SKILL.md and openai.yaml", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        skillMarkdown: validSkillMarkdown({
          frontmatter: {
            description: "Use when a test needs a parity violation fixture.",
            name: "hello",
          },
        }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("repo/invocation-policy-parity");
    });
  });

  it("reports Claude manifest versions that drift from the Codex manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeManifest: validClaudePluginManifest({ version: "2.0.0" }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("alignment/dual-version");
    });
  });

  it("reports Claude-targeted plugins whose Codex manifest moves skills away from ./skills/", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        manifest: validPluginManifest({ skills: "./other-skills/" }),
      });
      await writeText(
        repoRoot,
        "plugins/demo-plugin/other-skills/hello/SKILL.md",
        validSkillMarkdown(),
      );
      await writeText(
        repoRoot,
        "plugins/demo-plugin/other-skills/hello/agents/openai.yaml",
        toYaml(validOpenAiMetadata()),
      );

      const result = await lintPlugins({ repoRoot });

      expect(ruleIds(result.context)).toContain("claude-manifest/skills-discovery");
    });
  });

  it("allows Codex-only plugins to relocate skills without the Claude discovery rule", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeManifest: false,
        claudeMarketplace: false,
        manifest: validPluginManifest({ skills: "./other-skills/" }),
      });
      await writeText(
        repoRoot,
        "plugins/demo-plugin/other-skills/hello/SKILL.md",
        validSkillMarkdown(),
      );
      await writeText(
        repoRoot,
        "plugins/demo-plugin/other-skills/hello/agents/openai.yaml",
        toYaml(validOpenAiMetadata()),
      );

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(ruleIds(result.context)).not.toContain("claude-manifest/skills-discovery");
    });
  });

  it("reports Claude plugin manifests that are missing from the Claude catalog", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeMarketplace: false });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/manifest-listed");
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

  // Spec: "Add a walk over .agents/skills/* to pnpm lint:plugins that runs the whole skill-level
  // check set ... plus the fixture rules."
  it("lints repo-local skills under .agents/skills with the full skill check set", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        ".agents/skills/local-skill/SKILL.md",
        validSkillMarkdown({
          frontmatter: {
            description: "Use when the user asks for local-skill.",
            name: "local-skill",
          },
        }),
      );
      await writeJson(
        repoRoot,
        ".agents/skills/local-skill/agents/openai.yaml",
        validOpenAiMetadata({ policy: { allow_implicit_invocation: false } }),
      );
      await writeText(
        repoRoot,
        ".agents/skills/local-skill/evals/triggers.yaml",
        `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
    invoke-instead: missing-skill
`,
      );
      await writeText(repoRoot, ".agents/skills/.scratch/notes.txt", "ignored\n");
      // A repo-local skill without Codex UI metadata: only the codex target reports it.
      await writeText(
        repoRoot,
        ".agents/skills/bare-skill/SKILL.md",
        validSkillMarkdown({
          frontmatter: {
            description: "Use when the user asks for bare-skill.",
            name: "bare-skill",
          },
        }),
      );

      const result = await lintPlugins({ repoRoot });

      expect(result.repoLocalSkillCount).toBe(2);
      expect(ruleIds(result.context).sort()).toStrictEqual([
        "repo/invocation-policy-parity",
        "repo/openai-metadata-required",
        "trigger-fixture/alternate-missing",
      ]);
    });
  });

  it("counts repo-local skills in the clean summary", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        ".agents/skills/local-skill/SKILL.md",
        validSkillMarkdown({
          frontmatter: {
            description: "Use when the user asks for local-skill.",
            "disable-model-invocation": true,
            name: "local-skill",
          },
        }),
      );
      await writeJson(
        repoRoot,
        ".agents/skills/local-skill/agents/openai.yaml",
        validOpenAiMetadata(),
      );
      const log = vi.spyOn(console, "log").mockReturnValue(undefined);

      await runLintPlugins({ repoRoot });

      expect(log).toHaveBeenCalledWith("Linted 1 local plugin(s) and 1 repo-local skill(s).");
      log.mockRestore();
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
