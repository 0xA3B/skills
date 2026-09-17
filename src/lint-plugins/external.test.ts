import { describe, expect, it } from "vitest";

import { manifestUrlReferences } from "./external.js";
import {
  validClaudePluginManifest,
  validCodexInterface,
  validPortableManifest,
} from "./test-utils.js";

describe("manifestUrlReferences", () => {
  it("collects the shared metadata URLs and the Codex extension interface URLs", () => {
    const manifest = validPortableManifest({
      author: { name: "Test Developer", url: "https://example.com/dev" },
      extensions: {
        "com.openai": {
          interface: validCodexInterface({ websiteURL: "https://example.com/site" }),
        },
      },
      homepage: "https://example.com/home",
      repository: "https://example.com/repo",
    });

    expect(manifestUrlReferences(manifest, "plugin.json")).toStrictEqual([
      { filePath: "plugin.json", pointer: "/repository", value: "https://example.com/repo" },
      { filePath: "plugin.json", pointer: "/homepage", value: "https://example.com/home" },
      { filePath: "plugin.json", pointer: "/author/url", value: "https://example.com/dev" },
      {
        filePath: "plugin.json",
        pointer: "/extensions/com.openai/interface/websiteURL",
        value: "https://example.com/site",
      },
    ]);
  });

  it("ignores a root-level interface key, which no manifest carries any more", () => {
    const manifest = validClaudePluginManifest({
      interface: { websiteURL: "https://example.com/site" },
      repository: "https://example.com/repo",
    });

    expect(manifestUrlReferences(manifest, ".claude-plugin/plugin.json")).toStrictEqual([
      {
        filePath: ".claude-plugin/plugin.json",
        pointer: "/repository",
        value: "https://example.com/repo",
      },
    ]);
  });
});
