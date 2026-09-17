import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateClaudeExtension, validateClaudeExtensionAlignment } from "./claude-extension.js";
import {
  createTestContext,
  diagnosticByRule,
  diagnosticPointers,
  ruleIds,
  validClaudePluginManifest,
  validCodexInterface,
  validPortableManifest,
  withTempRepo,
  writeJson,
} from "./test-utils.js";

// The plugin as its Claude catalog entry describes it.
function demoOptions(repoRoot: string) {
  return { catalogName: "demo-plugin", pluginPath: `${repoRoot}/plugins/demo-plugin` };
}

describe("Claude extension validation", () => {
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

      const manifest = await validateClaudeExtension(context, demoOptions(repoRoot));

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

      await validateClaudeExtension(context, demoOptions(repoRoot));

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

      await validateClaudeExtension(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining(["alignment/name", "alignment/directory-name"]),
      );
    });
  });
});

describe("Claude extension alignment", () => {
  const manifestPath = "plugins/demo-plugin/.claude-plugin/plugin.json";

  it("accepts a Claude extension whose duplicated fields match the portable manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({ author: { name: "Test Developer" }, keywords: ["demo"] }),
        validPortableManifest({ author: { name: "Test Developer" }, keywords: ["demo"] }),
        validCodexInterface(),
      );

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  // Decision: the portable manifest is authoritative; a field the Claude extension duplicates
  // must match it exactly, and version lockstep is one case of that rule.
  it("reports duplicated fields that drift from the portable manifest", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({
          author: { name: "Someone Else" },
          keywords: ["demo", "extra"],
          version: "2.0.0",
        }),
        validPortableManifest({ author: { name: "Test Developer" }, keywords: ["demo"] }),
        validCodexInterface(),
      );

      expect(ruleIds(context)).toStrictEqual([
        "alignment/claude-extension",
        "alignment/claude-extension",
        "alignment/claude-extension",
      ]);
      expect(diagnosticPointers(context, "alignment/claude-extension").sort()).toStrictEqual([
        "/author",
        "/keywords",
        "/version",
      ]);
      expect(diagnosticByRule(context, "alignment/claude-extension")?.message).toBe(
        'Claude extension "version" ("2.0.0") does not match the portable manifest ("1.0.0"); plugin.json is authoritative.',
      );
    });
  });

  // JSON object key order carries no meaning, so an author written in a different order is equal.
  it("accepts an author object whose keys are ordered differently", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({
          author: { name: "Test Developer", url: "https://example.com" },
        }),
        validPortableManifest({ author: { url: "https://example.com", name: "Test Developer" } }),
        validCodexInterface(),
      );

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("reports a duplicated field the portable manifest does not carry", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({ license: "MIT" }),
        validPortableManifest(),
        validCodexInterface(),
      );

      expect(ruleIds(context)).toStrictEqual(["alignment/claude-extension"]);
      expect(diagnosticByRule(context, "alignment/claude-extension")?.message).toBe(
        'Claude extension "license" ("MIT") does not match the portable manifest (absent); plugin.json is authoritative.',
      );
    });
  });

  it("reports display names that drift from the Codex extension as errors", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({ displayName: "Different Name" }),
        validPortableManifest(),
        validCodexInterface(),
      );

      expect(ruleIds(context)).toStrictEqual(["alignment/dual-display-name"]);
      expect(diagnosticByRule(context, "alignment/dual-display-name")?.severity).toBe("error");
    });
  });

  it("skips the display name comparison when the plugin has no Codex extension", async () => {
    await withTempRepo(async (repoRoot) => {
      const context = createTestContext(repoRoot);

      validateClaudeExtensionAlignment(
        context,
        path.join(repoRoot, manifestPath),
        validClaudePluginManifest({ displayName: "Claude Only Name" }),
        validPortableManifest({ extensions: undefined }),
        undefined,
      );

      expect(context.diagnostics).toStrictEqual([]);
    });
  });
});
