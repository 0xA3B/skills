import { mkdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validatePluginRepository } from "../../src/lint-plugins/repository.js";
import {
  createTestContext,
  diagnosticPointers,
  ruleIds,
  validClaudeMarketplace,
  validMarketplace,
  validPortableManifest,
  validSkillMarkdown,
  withTempRepo,
  writeJson,
  writeText,
  writeValidPluginRepo,
} from "./test-utils.js";

describe("plugin repository validation", () => {
  it("checks category alignment on every declaration, including duplicate names", async () => {
    await withTempRepo(async (repoRoot) => {
      const marketplace = validMarketplace();
      marketplace.plugins.unshift({ ...marketplace.plugins[0]!, category: "wrong-category" });
      await writeValidPluginRepo(repoRoot, { marketplace });

      const context = createTestContext(repoRoot);
      const result = await validatePluginRepository(context);

      expect(result.catalog.localEntries).toHaveLength(2);
      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining(["marketplace/duplicate-name", "alignment/category"]),
      );
      expect(context.diagnostics.find((d) => d.ruleId === "alignment/category")).toMatchObject({
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

        const context = createTestContext(repoRoot);
        const result = await validatePluginRepository(context);

        expect(result.plugins.length).toBe(1);
        expect(context.diagnostics.filter((d) => d.ruleId === "alignment/name")).toStrictEqual([
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

  // Decision: a plugin targets Codex exactly when it has both extensions.com.openai and a Codex
  // catalog entry; either half without the other is an error.
  it("reports a Codex catalog entry whose plugin ships no Codex extension", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        manifest: validPortableManifest({ extensions: undefined }),
      });

      const context = createTestContext(repoRoot);
      const repository = await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toContain("coverage/codex-extension");
      expect(repository.plugins).toStrictEqual([
        {
          pluginPath: path.join(repoRoot, "plugins/demo-plugin"),
          targets: { claude: true, codex: true },
        },
      ]);
      expect(repository.missingTargets("demo-plugin", { claude: true, codex: true })).toStrictEqual(
        ["codex"],
      );
    });
  });

  it("reports a Codex extension whose plugin is missing from the Codex catalog", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { marketplace: validMarketplace({ plugins: [] }) });

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toContain("coverage/manifest-listed");
    });
  });

  // Agent Plugins 1.0.0: "The Agent Plugins core specification defines exactly one portable
  // manifest per plugin." Every directory under plugins/ is a plugin, so each needs one.
  it("reports a plugin directory without a portable manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(repoRoot, "plugins/bare/skills/hello/SKILL.md", validSkillMarkdown());

      const context = createTestContext(repoRoot);
      const result = await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toContain("coverage/portable-manifest");
      expect(result.plugins.length).toBe(2);
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

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toContain("coverage/target-required");
    });
  });

  // Decision: Codex settings live only in the Codex extension, so a leftover overlay is dead
  // metadata that can drift, whether or not it still holds a manifest.
  it("reports a leftover .codex-plugin directory even when it is empty", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await mkdir(path.join(repoRoot, "plugins/demo-plugin/.codex-plugin"), { recursive: true });

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toContain("coverage/legacy-codex-manifest");
    });
  });

  // The hint to create the Claude catalog appears only while no catalog exists at all.
  it("reports Claude extensions that are missing from the Claude catalog", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeMarketplace: false });

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(context.diagnostics.map((diagnostic) => diagnostic.message)).toStrictEqual([
        "Plugin ships a Claude extension but is missing from the Claude marketplace catalog. Add .claude-plugin/marketplace.json to expose Claude plugins.",
      ]);
    });
  });

  it("reports Claude extensions that an existing Claude catalog omits without the hint", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, {
        claudeMarketplace: validClaudeMarketplace({ plugins: [] }),
      });

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(context.diagnostics.map((diagnostic) => diagnostic.message)).toStrictEqual([
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

      const context = createTestContext(repoRoot);
      const repository = await validatePluginRepository(context);

      expect(ruleIds(context)).toStrictEqual(["coverage/manifest-listed"]);
      expect(repository.plugins).toStrictEqual([
        {
          pluginPath: path.join(repoRoot, "plugins/demo-plugin"),
          targets: { claude: true, codex: false },
        },
      ]);
    });
  });

  it.each([
    { homepage: "https://example.invalid/home", expectedRules: [] },
    { homepage: "not a URL", expectedRules: ["url/http"] },
    { homepage: "file:///tmp/home", expectedRules: ["url/http"] },
  ])(
    "validates URL syntax locally for a Claude-only plugin: $homepage",
    async ({ homepage, expectedRules }) => {
      await withTempRepo(async (repoRoot) => {
        await writeValidPluginRepo(repoRoot, {
          manifest: validPortableManifest({ extensions: undefined, homepage }),
          marketplace: validMarketplace({ plugins: [] }),
        });

        const context = createTestContext(repoRoot);
        await validatePluginRepository(context);

        expect(ruleIds(context)).toStrictEqual(expectedRules);
      });
    },
  );

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

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(ruleIds(context)).not.toContain("coverage/manifest-listed");
    });
  });

  it("lints a repository that has no plugins directory", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        ".agents/plugins/marketplace.json",
        validMarketplace({ plugins: [] }),
      );

      const context = createTestContext(repoRoot);
      const result = await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.plugins.length).toBe(0);
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

      const context = createTestContext(repoRoot);
      await validatePluginRepository(context);

      expect(context.diagnostics.filter((d) => d.severity === "error")).toHaveLength(1);
      expect(ruleIds(context)).toStrictEqual(["parse/json"]);
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
            source: { path: "./plugins/missing", source: "local" },
          },
        ],
      });
      const context = createTestContext(repoRoot);

      await validatePluginRepository(context);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "marketplace/duplicate-name",
          "marketplace/source-path",
          "marketplace/source-exists",
        ]),
      );
    });
  });

  it("reports a missing portable manifest without discarding the catalog declaration", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, ".agents/plugins/marketplace.json", validMarketplace());
      await writeText(repoRoot, "plugins/demo-plugin/skills/hello/SKILL.md", validSkillMarkdown());
      const context = createTestContext(repoRoot);

      const { catalog } = await validatePluginRepository(context);

      expect(ruleIds(context)).toContain("marketplace/source-manifest");
      expect(diagnosticPointers(context, "marketplace/source-manifest")).toStrictEqual([
        "/plugins/0/source",
      ]);
      expect(catalog.localEntries.length).toBe(1);
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

      const { claudeCatalog: catalog } = await validatePluginRepository(context);

      expect(catalog.localEntries.length).toBe(2);
      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "claude-marketplace/source-manifest",
          "claude-marketplace/source-exists",
          "claude-marketplace/source",
        ]),
      );
    });
  });
});
