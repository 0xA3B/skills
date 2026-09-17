import { describe, expect, it } from "vitest";

import { validatePortableManifest } from "./portable-manifest.js";
import {
  createTestContext,
  diagnosticByRule,
  diagnosticPointers,
  ruleIds,
  validCodexInterface,
  validPortableManifest,
  withTempRepo,
  writeJson,
  writeText,
} from "./test-utils.js";

const MANIFEST = "plugins/demo-plugin/plugin.json";

// The plugin as its Codex catalog entry describes it.
function demoOptions(repoRoot: string, name = "demo-plugin") {
  return { catalogName: name, category: "workflow", pluginPath: `${repoRoot}/plugins/${name}` };
}

function codexExtension(extension: Record<string, unknown>): Record<string, unknown> {
  return { "com.openai": extension };
}

describe("portable manifest validation", () => {
  it("accepts a portable manifest whose Codex extension carries interface metadata", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          author: { email: "dev@example.com", name: "Test Developer" },
          homepage: "https://example.com/demo-plugin",
          keywords: ["demo"],
          license: "MIT",
          repository: "https://example.com/repo",
        }),
      );
      const context = createTestContext(repoRoot);

      const result = await validatePortableManifest(context, demoOptions(repoRoot));

      expect(context.diagnostics).toStrictEqual([]);
      expect(result?.manifest["name"]).toBe("demo-plugin");
      expect(result?.codexExtension).toBeDefined();
    });
  });

  // Agent Plugins 1.0.0 plugin.schema.json: `"additionalProperties": false` at the root, with
  // exactly ten permitted properties.
  it("rejects keys outside the Agent Plugins schema", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({ displayName: "Demo Plugin", skills: "./skills/" }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["portable-manifest/key", "portable-manifest/key"]);
      expect(diagnosticPointers(context, "portable-manifest/key")).toStrictEqual([
        "/displayName",
        "/skills",
      ]);
    });
  });

  // Agent Plugins 1.0.0 plugin.schema.json: `$schema` is required and its value is the constant
  // "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json".
  it("requires $schema to name the 1.0.0 plugin schema", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          $schema: "https://agent-plugins.org/schemas/0.9.0/plugin.schema.json",
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["portable-manifest/schema"]);
    });
  });

  it("reports a missing $schema", async () => {
    await withTempRepo(async (repoRoot) => {
      const { $schema: _schema, ...manifest } = validPortableManifest();
      await writeJson(repoRoot, MANIFEST, manifest);
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["portable-manifest/schema"]);
    });
  });

  // Agent Plugins 1.0.0 plugin.schema.json name pattern:
  // "^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$", 1 to 64 characters.
  it("rejects names outside the Agent Plugins name pattern", async () => {
    await withTempRepo(async (repoRoot) => {
      const names = ["Demo-Plugin", "demo--plugin", "-demo", "demo.", "a".repeat(65)];
      const rulesByName: Record<string, string[]> = {};
      for (const name of names) {
        await writeJson(repoRoot, `plugins/${name}/plugin.json`, validPortableManifest({ name }));
        const context = createTestContext(repoRoot);

        await validatePortableManifest(context, demoOptions(repoRoot, name));

        rulesByName[name] = ruleIds(context);
      }

      expect(rulesByName).toStrictEqual(
        Object.fromEntries(names.map((name) => [name, ["portable-manifest/name"]])),
      );
    });
  });

  it("accepts dotted names the Agent Plugins pattern allows", async () => {
    await withTempRepo(async (repoRoot) => {
      const name = "demo.plugin-2";
      await writeJson(repoRoot, `plugins/${name}/plugin.json`, validPortableManifest({ name }));
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot, name));

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  // Agent Plugins 1.0.0 plugin.schema.json: author permits only name, email, and url.
  it("rejects author keys outside name, email, and url", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({ author: { handle: "someone", name: "Test Developer" } }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["portable-manifest/author-key"]);
      expect(diagnosticPointers(context, "portable-manifest/author-key")).toStrictEqual([
        "/author/handle",
      ]);
    });
  });

  // Repository decision: this marketplace ships to Codex and Claude Code only, so a namespace
  // other than com.openai is a typo until another client is targeted.
  it("rejects extension namespaces other than com.openai", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: {
            "com.example.client": { interface: {} },
            "com.openai": { interface: validCodexInterface() },
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["portable-manifest/extension-namespace"]);
      expect(diagnosticPointers(context, "portable-manifest/extension-namespace")).toStrictEqual([
        "/extensions/com.example.client",
      ]);
    });
  });

  // Codex packaging docs: "Put OpenAI-specific presentation, registered MCP server mappings, and
  // hook settings under extensions.com.openai" — the keys are interface, apps, and hooks.
  it("rejects Codex extension keys other than apps, hooks, and interface", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({ interface: validCodexInterface(), skills: "./skills/" }),
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["codex-extension/key"]);
      expect(diagnosticPointers(context, "codex-extension/key")).toStrictEqual([
        "/extensions/com.openai/skills",
      ]);
    });
  });

  it("reports interface problems and paths inside the Codex extension", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({
            apps: "./missing.app.json",
            interface: validCodexInterface({
              brandColor: "blue",
              capabilities: [],
              category: "wrong-category",
              logo: "../outside.png",
            }),
          }),
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context).sort()).toStrictEqual([
        "alignment/category",
        "manifest/brand-color",
        "manifest/path",
        "manifest/path-exists",
        "schema/string-array",
      ]);
      expect(diagnosticPointers(context, "manifest/path")).toStrictEqual([
        "/extensions/com.openai/interface/logo",
      ]);
      expect(diagnosticPointers(context, "manifest/path-exists")).toStrictEqual([
        "/extensions/com.openai/apps",
      ]);
    });
  });

  // Codex packaging docs: hooks is a plugin-relative path such as "./hooks/hooks.json".
  it("accepts a Codex extension whose hooks and apps paths exist", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({
            apps: "./.app.json",
            hooks: "./hooks/hooks.json",
            interface: validCodexInterface(),
          }),
        }),
      );
      await writeJson(repoRoot, "plugins/demo-plugin/.app.json", {});
      await writeJson(repoRoot, "plugins/demo-plugin/hooks/hooks.json", {});
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("reports hooks values that are neither paths nor lifecycle objects", async () => {
    await withTempRepo(async (repoRoot) => {
      const cases: [unknown, string[]][] = [
        ["./hooks/missing.json", ["manifest/path-exists"]],
        [
          ["./hooks/missing.json", 42],
          ["manifest/path-exists", "manifest/hooks"],
        ],
        [42, ["manifest/hooks"]],
      ];
      const results: string[][] = [];
      for (const [hooks] of cases) {
        await writeJson(
          repoRoot,
          MANIFEST,
          validPortableManifest({
            extensions: codexExtension({ hooks, interface: validCodexInterface() }),
          }),
        );
        const context = createTestContext(repoRoot);

        await validatePortableManifest(context, demoOptions(repoRoot));

        results.push(ruleIds(context));
      }

      expect(results).toStrictEqual(cases.map(([, expected]) => expected));
    });
  });

  it("reports screenshots that do not exist by index", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "plugins/demo-plugin/assets/one.png", "");
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({
            interface: validCodexInterface({
              screenshots: ["./assets/one.png", "./assets/two.png"],
            }),
          }),
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(diagnosticPointers(context, "manifest/path-exists")).toStrictEqual([
        "/extensions/com.openai/interface/screenshots/1",
      ]);
    });
  });

  it("requires the Codex interface display strings", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({ interface: { capabilities: ["skills"] } }),
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(diagnosticPointers(context, "schema/string")).toStrictEqual([
        "/extensions/com.openai/interface/displayName",
        "/extensions/com.openai/interface/shortDescription",
        "/extensions/com.openai/interface/longDescription",
        "/extensions/com.openai/interface/developerName",
        "/extensions/com.openai/interface/category",
      ]);
    });
  });

  it("reports plugin default prompt arrays that exceed the Codex UI limit", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({
          extensions: codexExtension({
            interface: validCodexInterface({
              defaultPrompt: [
                "Use $demo-plugin:first.",
                "Use $demo-plugin:second.",
                "Use $demo-plugin:third.",
                "Use $demo-plugin:fourth.",
              ],
            }),
          }),
        }),
      );
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context)).toStrictEqual(["manifest/default-prompt-limit"]);
    });
  });

  it("reports marketplace and directory name misalignment", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(repoRoot, MANIFEST, validPortableManifest({ name: "other-plugin" }));
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(ruleIds(context).sort()).toStrictEqual(["alignment/directory-name", "alignment/name"]);
    });
  });

  // Repository decision: version and description are optional in Agent Plugins 1.0.0 but this
  // repository keys version lockstep and catalog descriptions on them.
  it("requires version and description even though the spec leaves them optional", async () => {
    await withTempRepo(async (repoRoot) => {
      const { description: _description, version: _version, ...manifest } = validPortableManifest();
      await writeJson(repoRoot, MANIFEST, manifest);
      const context = createTestContext(repoRoot);

      await validatePortableManifest(context, demoOptions(repoRoot));

      expect(diagnosticPointers(context, "schema/string")).toStrictEqual([
        "/version",
        "/description",
      ]);
    });
  });

  it("validates a portable manifest without a Codex catalog entry against its directory", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeJson(
        repoRoot,
        MANIFEST,
        validPortableManifest({ extensions: undefined, name: "other-plugin" }),
      );
      const context = createTestContext(repoRoot);

      const result = await validatePortableManifest(context, {
        pluginPath: `${repoRoot}/plugins/demo-plugin`,
      });

      expect(ruleIds(context)).toStrictEqual(["alignment/directory-name"]);
      expect(result?.codexExtension).toBeUndefined();
      expect(diagnosticByRule(context, "alignment/directory-name")?.filePath).toBe(
        `${repoRoot}/plugins/demo-plugin/plugin.json`,
      );
    });
  });
});
