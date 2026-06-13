import { mkdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createTestContext,
  ruleIds,
  toYaml,
  validOpenAiMetadata,
  withTempRepo,
  writeText,
} from "../test-utils.js";
import { validateOpenAiMetadata } from "./openai-metadata.js";

describe("OpenAI skill metadata validation", () => {
  it("accepts Codex openai.yaml metadata with optional icons and tool dependencies", async () => {
    await withTempRepo(async (repoRoot) => {
      await mkdir(path.join(repoRoot, "skills/hello/assets"), { recursive: true });
      await writeText(repoRoot, "skills/hello/assets/small-logo.svg", "<svg />");
      await writeText(repoRoot, "skills/hello/assets/large-logo.png", "png");
      const metadataPath = await writeText(
        repoRoot,
        "skills/hello/agents/openai.yaml",
        toYaml(
          validOpenAiMetadata({
            dependencies: {
              tools: [
                {
                  description: "OpenAI Docs MCP server",
                  transport: "streamable_http",
                  type: "mcp",
                  url: "https://developers.openai.com/mcp",
                  value: "openaiDeveloperDocs",
                },
              ],
            },
            interface: {
              brand_color: "#3B82F6",
              default_prompt: "Use $demo:hello.",
              display_name: "Hello",
              icon_large: "./assets/large-logo.png",
              icon_small: "./assets/small-logo.svg",
              short_description: "Valid metadata",
            },
          }),
        ),
      );
      const context = createTestContext(repoRoot);

      await validateOpenAiMetadata(context, "hello", metadataPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("separates OpenAI metadata checks from repo version policy", async () => {
    await withTempRepo(async (repoRoot) => {
      const metadataPath = await writeText(
        repoRoot,
        "skills/hello/agents/openai.yaml",
        toYaml({
          dependencies: {
            tools: [{ type: "http", url: "not a url", value: "someTool" }],
          },
          interface: {
            brand_color: "blue",
            default_prompt: "",
            display_name: "Hello",
            short_description: "Invalid metadata",
            unsupported: true,
          },
          policy: { allow_implicit_invocation: "false" },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateOpenAiMetadata(context, "hello", metadataPath);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "repo/openai-metadata-version",
          "openai-metadata/key",
          "openai-metadata/default-prompt",
          "openai-metadata/brand-color",
          "schema/boolean",
          "openai-metadata/dependency-tool-type",
          "openai-metadata/url",
        ]),
      );
    });
  });
});
