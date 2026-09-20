import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { lintPlugins, runLintPlugins } from "../../src/lint-plugins/runner.js";
import {
  ruleIds,
  validClaudeMarketplace,
  validClaudePluginManifest,
  validMarketplace,
  validOpenAiMetadata,
  validPortableManifest,
  validSkillMarkdown,
  withTempRepo,
  writeJson,
  writeText,
  writeValidPluginRepo,
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
        await writeText(
          repoRoot,
          "plugins/demo-plugin/skills/auto/SKILL.md",
          validSkillMarkdown({
            frontmatter: { name: "auto", description: "Use for the alternate routing case." },
          }),
        );
        await writeJson(
          repoRoot,
          "plugins/demo-plugin/skills/auto/agents/openai.yaml",
          validOpenAiMetadata({
            policy: { allow_implicit_invocation: true },
          }),
        );
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
      await writeJson(
        repoRoot,
        "plugins/z-plugin/plugin.json",
        validPortableManifest({ name: "z-plugin" }),
      );
      await writeText(
        repoRoot,
        "plugins/z-plugin/skills/auto/SKILL.md",
        validSkillMarkdown({
          frontmatter: {
            name: "auto",
            description: "Use when a routing assertion needs an alternate.",
          },
        }),
      );
      await writeJson(
        repoRoot,
        "plugins/z-plugin/skills/auto/agents/openai.yaml",
        validOpenAiMetadata({
          policy: { allow_implicit_invocation: true },
        }),
      );
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

  it("checks category alignment on every declaration, including duplicate names", async () => {
    await withTempRepo(async (repoRoot) => {
      const marketplace = validMarketplace();
      marketplace.plugins.unshift({ ...marketplace.plugins[0]!, category: "wrong-category" });
      await writeValidPluginRepo(repoRoot, { marketplace });

      const result = await lintPlugins({ repoRoot });

      expect(result.catalog.localEntries).toHaveLength(2);
      expect(ruleIds(result.context)).toStrictEqual(
        expect.arrayContaining(["marketplace/duplicate-name", "alignment/category"]),
      );
      expect(
        result.context.diagnostics.find((d) => d.ruleId === "alignment/category"),
      ).toMatchObject({
        filePath: path.join(repoRoot, "plugins/demo-plugin/plugin.json"),
        pointer: "/extensions/com.openai/interface/category",
      });
    });
  });

  it.each(["codex", "claude"] as const)(
    "checks every %s catalog declaration when two names resolve to one plugin",
    async (target) => {
      await withTempRepo(async (repoRoot) => {
        const marketplace = validMarketplace();
        const claudeMarketplace = validClaudeMarketplace();
        if (target === "codex") {
          marketplace.plugins.unshift({
            ...marketplace.plugins[0]!,
            name: "wrong-name",
          });
        } else {
          claudeMarketplace.plugins.unshift({
            name: "wrong-name",
            source: "./plugins/demo-plugin",
          });
        }
        await writeValidPluginRepo(repoRoot, { marketplace, claudeMarketplace });

        const result = await lintPlugins({ repoRoot });

        expect(result.pluginCount).toBe(1);
        expect(
          result.context.diagnostics.filter((d) => d.ruleId === "alignment/name"),
        ).toStrictEqual([
          expect.objectContaining({
            filePath: path.join(
              repoRoot,
              "plugins/demo-plugin",
              target === "codex" ? "plugin.json" : ".claude-plugin/plugin.json",
            ),
            pointer: "/name",
            message: 'Manifest name "demo-plugin" does not match marketplace name "wrong-name".',
          }),
        ]);
      });
    },
  );

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
        "plugins/demo-plugin/plugin.json",
        validPortableManifest({ extensions: undefined }),
      );
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

  // Decision: a plugin targets Codex exactly when it has both extensions.com.openai and a Codex
  // catalog entry; either half without the other is an error.
  it("reports a Codex catalog entry whose plugin ships no Codex extension", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        manifest: validPortableManifest({ extensions: undefined }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/codex-extension");
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

  it("reports a Codex extension whose plugin is missing from the Codex catalog", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { marketplace: validMarketplace({ plugins: [] }) });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/manifest-listed");
    });
  });

  // Agent Plugins 1.0.0: "The Agent Plugins core specification defines exactly one portable
  // manifest per plugin." Every directory under plugins/ is a plugin, so each needs one.
  it("reports a plugin directory without a portable manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(repoRoot, "plugins/bare/skills/hello/SKILL.md", validSkillMarkdown());

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/portable-manifest");
      expect(result.pluginCount).toBe(2);
    });
  });

  // Decision: a root manifest alone declares no target, and a plugin unreachable from both
  // catalogs is an error.
  it("reports a plugin that targets neither Codex nor Claude Code", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeManifest: false,
        claudeMarketplace: false,
        marketplace: validMarketplace({ plugins: [] }),
        manifest: validPortableManifest({ extensions: undefined }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/target-required");
    });
  });

  // Decision: Codex settings live only in the Codex extension, so a leftover overlay is dead
  // metadata that can drift, whether or not it still holds a manifest.
  it("reports a leftover .codex-plugin directory even when it is empty", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await mkdir(path.join(repoRoot, "plugins/demo-plugin/.codex-plugin"), { recursive: true });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toContain("coverage/legacy-codex-manifest");
    });
  });

  // The hint to create the Claude catalog appears only while no catalog exists at all.
  it("reports Claude extensions that are missing from the Claude catalog", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeMarketplace: false });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(result.context.diagnostics.map((diagnostic) => diagnostic.message)).toStrictEqual([
        "Plugin ships a Claude extension but is missing from the Claude marketplace catalog. Add .claude-plugin/marketplace.json to expose Claude plugins.",
      ]);
    });
  });

  it("reports Claude extensions that an existing Claude catalog omits without the hint", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeMarketplace: validClaudeMarketplace({ plugins: [] }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(result.context.diagnostics.map((diagnostic) => diagnostic.message)).toStrictEqual([
        "Plugin ships a Claude extension but is missing from the Claude marketplace catalog.",
      ]);
    });
  });

  // A shipped extension is a declared target even before its catalog entry exists, so the only
  // error is the missing listing, not "targets no agent".
  it("treats an unlisted Claude extension as a target rather than a target-less plugin", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeMarketplace: false,
        marketplace: validMarketplace({ plugins: [] }),
        manifest: validPortableManifest({ extensions: undefined }),
      });

      const result = await lintPlugins({ repoRoot });

      expect(ruleIds(result.context)).toStrictEqual(["coverage/manifest-listed"]);
    });
  });

  // The portable manifest is authoritative and its optional URLs need not be duplicated into the
  // Claude extension, so a Claude-only plugin's root manifest is probed even though no Codex
  // catalog entry points at it.
  it("probes the portable manifest URLs of a Claude-only plugin under external validation", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        manifest: validPortableManifest({
          extensions: undefined,
          homepage: "https://example.invalid/home",
        }),
        marketplace: validMarketplace({ plugins: [] }),
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404 }));

      try {
        const result = await lintPlugins({ externalValidationEnabled: true, repoRoot });

        const unreachable = result.context.diagnostics
          .filter((diagnostic) => diagnostic.ruleId === "external/url-reachable")
          .map((diagnostic) => [path.relative(repoRoot, diagnostic.filePath), diagnostic.pointer]);
        expect(unreachable).toStrictEqual([["plugins/demo-plugin/plugin.json", "/homepage"]]);
      } finally {
        vi.unstubAllGlobals();
      }
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

  // Issue #107: a plugin is a bundle under plugins/<name>/, so a manifest anywhere else is not one
  // of the repository's plugins: an agent worktree checkout under .claude/worktrees/, a copy nested
  // inside a plugin bundle, or a dot-prefixed scratch directory under plugins/.
  it("ignores plugin manifests that are not directly under plugins/<name>", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      for (const manifestPath of [
        ".claude/worktrees/x/plugins/demo/plugin.json",
        "plugins/demo-plugin/.claude/worktrees/x/plugins/demo/plugin.json",
        "plugins/.scratch/plugin.json",
      ]) {
        await writeJson(repoRoot, manifestPath, validPortableManifest());
      }

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(ruleIds(result.context)).not.toContain("coverage/manifest-listed");
    });
  });

  it("lints a repository that has no plugins directory", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        ".agents/plugins/marketplace.json",
        validMarketplace({ plugins: [] }),
      );

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(0);
      expect(result.pluginCount).toBe(0);
    });
  });

  it("reports parse errors for malformed manifests that are not listed in the marketplace", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        ".agents/plugins/marketplace.json",
        validMarketplace({ plugins: [] }),
      );
      await writeText(repoRoot, "plugins/broken/plugin.json", "{");

      const result = await lintPlugins({ repoRoot });

      expect(result.errorCount).toBe(1);
      expect(ruleIds(result.context)).toStrictEqual(["parse/json"]);
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
