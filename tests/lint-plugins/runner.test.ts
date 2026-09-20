import { rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { lintPlugins, runLintPlugins } from "../../src/lint-plugins/runner.js";
import {
  ruleIds,
  validClaudePluginManifest,
  validMarketplace,
  validOpenAiMetadata,
  validPortableManifest,
  validSkillMarkdown,
  withTempRepo,
  writeText,
  writeValidPluginRepo,
  writePlugin,
  writeSkill,
} from "./test-utils.js";

describe("lint runner", () => {
  it.each(["missing", "unreadable"])(
    "leaves alternate Codex presence unknown when its portable manifest is %s",
    async (state) => {
      await withTempRepo(async (repoRoot) => {
        await writeValidPluginRepo(repoRoot);
        if (state === "missing") {
          await rm(path.join(repoRoot, "plugins/demo-plugin/plugin.json"));
        } else {
          await writeText(repoRoot, "plugins/demo-plugin/plugin.json", "{");
        }
        await writeSkill(repoRoot, { pluginName: "demo-plugin", name: "auto", implicit: true });
        await writeText(
          repoRoot,
          "plugins/demo-plugin/skills/hello/evals/triggers.yaml",
          `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
    invoke-instead: demo-plugin:auto
`,
        );

        const result = await lintPlugins({ repoRoot });

        expect(ruleIds(result.context)).toContain(
          state === "missing" ? "coverage/portable-manifest" : "parse/json",
        );
        expect(ruleIds(result.context)).not.toContain("trigger-fixture/alternate-target");
        expect(ruleIds(result.context)).not.toContain("coverage/codex-extension");
      });
    },
  );

  it("resolves later plugins before checking cross-plugin routing assertions", async () => {
    await withTempRepo(async (repoRoot) => {
      const marketplace = validMarketplace();
      marketplace.plugins.push({
        ...marketplace.plugins[0]!,
        name: "z-plugin",
        source: "./plugins/z-plugin",
      });
      await writeValidPluginRepo(repoRoot, { marketplace });
      await writePlugin(repoRoot, {
        name: "z-plugin",
        targets: { claude: false, codex: true },
        skillName: "auto",
        implicit: true,
      });
      await writeText(
        repoRoot,
        "plugins/demo-plugin/skills/hello/evals/triggers.yaml",
        `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
    invoke-instead: z-plugin:auto
`,
      );

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(result.context.diagnostics).toStrictEqual([
        expect.objectContaining({
          ruleId: "trigger-fixture/alternate-target",
          pointer: "/cases/1/invoke-instead",
          message:
            'invoke-instead names "z-plugin:auto", but plugin "z-plugin" does not ship on claude, where this fixture also runs.',
        }),
      ]);
    });
  });

  it("keeps checking the Claude extension and skills when the portable manifest cannot be parsed", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeManifest: validClaudePluginManifest({ skills: "./elsewhere" }),
      });
      await writeText(repoRoot, "plugins/demo-plugin/plugin.json", "{");
      await rm(path.join(repoRoot, "plugins/demo-plugin/skills/hello/agents/openai.yaml"));

      const result = await lintPlugins({ repoRoot });

      expect(ruleIds(result.context)).toStrictEqual(
        expect.arrayContaining([
          "parse/json",
          "claude-manifest/skills-path",
          "repo/openai-metadata-required",
        ]),
      );
      expect(ruleIds(result.context)).not.toContain("coverage/codex-extension");
    });
  });

  // Agent Plugins 1.0.0: "The Agent Plugins core specification defines exactly one portable
  // manifest per plugin", plugin.json at the plugin root. Codex reads its metadata from
  // extensions.com.openai in that file; Claude Code keeps reading .claude-plugin/plugin.json.
  it("returns a clean result for a plugin that ships a portable manifest and both target extensions", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.catalog.localEntries.length).toBe(1);
      expect(result.claudeCatalog.localEntries.length).toBe(1);
      expect(result.pluginCount).toBe(1);
    });
  });

  it("accepts Codex-only plugins that skip the Claude surfaces", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        name: "codex-only",
        skillName: "auto",
        implicit: true,
        targets: { claude: false, codex: true },
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.claudeCatalog.present).toBe(false);
      expect(result.catalog.localEntries.map((entry) => entry.name)).toStrictEqual(["codex-only"]);
    });
  });

  it("accepts Claude-only plugins without requiring OpenAI skill metadata", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        targets: { claude: true, codex: false },
        implicit: true,
      });

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

  it("reports Claude extension versions that drift from the portable manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeManifest: validClaudePluginManifest({ version: "2.0.0" }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("alignment/claude-extension");
    });
  });

  // Decision: a half-declared target still gets that target's skill checks, so one run surfaces
  // the missing extension and the missing Codex UI metadata together.
  it("keeps Codex skill checks for a plugin the Codex catalog lists without the extension", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        manifest: validPortableManifest({ extensions: undefined }),
      });
      await rm(path.join(repoRoot, "plugins/demo-plugin/skills/hello/agents/openai.yaml"));

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(2);
      expect(ruleIds(result.context)).toStrictEqual([
        "coverage/codex-extension",
        "repo/openai-metadata-required",
      ]);
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

  // Spec: "Add a walk over .agents/skills/* to pnpm lint:plugins that runs the whole skill-level
  // check set ... plus the fixture rules."
  it("lints repo-local skills under .agents/skills with the full skill check set", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeSkill(repoRoot, {
        name: "local-skill",
        implicit: true,
        openAiMetadata: validOpenAiMetadata({ policy: { allow_implicit_invocation: false } }),
      });
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
      await writeSkill(repoRoot, { name: "bare-skill", implicit: true, openAiMetadata: false });

      const result = await lintPlugins({ repoRoot });

      expect(result.repoLocalSkillCount).toBe(2);
      expect(ruleIds(result.context)).toStrictEqual([
        "repo/invocation-policy-parity",
        "repo/openai-metadata-required",
        "trigger-fixture/alternate-missing",
      ]);
    });
  });

  it("counts repo-local skills in the clean summary", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeSkill(repoRoot, { name: "local-skill" });
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
