import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import type { Diagnostic, ValidationContext } from "./diagnostics.js";
import { createValidationContext } from "./diagnostics.js";
import type { JsonObject, LocalCatalogEntry } from "./types.js";

type MarketplacePlugin = {
  category: string;
  name: string;
  policy: {
    authentication: string;
    installation: string;
  };
  source: string | JsonObject;
};

type MarketplaceFixture = {
  interface: { displayName: string };
  name: string;
  plugins: MarketplacePlugin[];
};

type PluginManifestFixture = JsonObject & {
  description: string;
  interface: JsonObject;
  name: string;
  skills: string;
  version: string;
};

type SkillMarkdownFixture = {
  body?: string;
  frontmatter: JsonObject;
};

type OpenAiMetadataFixture = JsonObject & {
  interface: JsonObject;
  policy: JsonObject;
};

type PluginRepoFixture = {
  marketplace?: MarketplaceFixture;
  manifest?: PluginManifestFixture;
  openAiMetadata?: OpenAiMetadataFixture | string;
  skillMarkdown?: SkillMarkdownFixture | string;
};

export async function withTempRepo<T>(callback: (repoRoot: string) => Promise<T>): Promise<T> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "lint-plugins-test-"));
  try {
    return await callback(repoRoot);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
}

export function createTestContext(repoRoot: string): ValidationContext {
  return createValidationContext({ externalValidationEnabled: false, repoRoot });
}

export function ruleIds(context: ValidationContext): string[] {
  return context.diagnostics.map((diagnostic) => diagnostic.ruleId);
}

export function diagnosticPointers(context: ValidationContext, ruleId: string): string[] {
  return context.diagnostics
    .filter((diagnostic) => diagnostic.ruleId === ruleId)
    .map((diagnostic) => diagnostic.pointer ?? "");
}

export function diagnosticByRule(
  context: ValidationContext,
  ruleId: string,
): Diagnostic | undefined {
  return context.diagnostics.find((diagnostic) => diagnostic.ruleId === ruleId);
}

export async function writeText(
  repoRoot: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const filePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
}

export async function writeJson(
  repoRoot: string,
  relativePath: string,
  value: unknown,
): Promise<string> {
  return writeText(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function validMarketplace(overrides: Partial<MarketplaceFixture> = {}): MarketplaceFixture {
  return {
    interface: { displayName: "Test Marketplace" },
    name: "test-marketplace",
    plugins: [
      {
        category: "workflow",
        name: "demo-plugin",
        policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
        source: "./codex_plugins/demo-plugin",
      },
    ],
    ...overrides,
  };
}

export function validPluginManifest(
  overrides: Partial<PluginManifestFixture> = {},
): PluginManifestFixture {
  return {
    description: "Demo plugin",
    interface: {
      capabilities: ["skills"],
      category: "workflow",
      defaultPrompt: ["Use $demo-plugin:hello."],
      developerName: "Test Developer",
      displayName: "Demo Plugin",
      longDescription: "A plugin used by lint tests.",
      shortDescription: "Demo plugin",
    },
    name: "demo-plugin",
    skills: "./skills/",
    version: "1.0.0",
    ...overrides,
  };
}

export function validSkillMarkdown(overrides: Partial<SkillMarkdownFixture> = {}): string {
  const fixture: SkillMarkdownFixture = {
    body: "# Hello\n\nFollow the test fixture instructions.",
    frontmatter: {
      description: "Use when a test needs a valid skill fixture.",
      metadata: { source: "fixture" },
      name: "hello",
    },
    ...overrides,
  };

  return `---\n${toYaml(fixture.frontmatter)}---\n${fixture.body ?? ""}\n`;
}

export function validOpenAiMetadata(
  overrides: Partial<OpenAiMetadataFixture> = {},
): OpenAiMetadataFixture {
  return {
    interface: {
      default_prompt: "Use $demo-plugin:hello.",
      display_name: "Hello",
      short_description: "Valid skill fixture",
    },
    policy: {
      allow_implicit_invocation: false,
    },
    version: 1,
    ...overrides,
  };
}

export function validLocalCatalogEntry(repoRoot: string): LocalCatalogEntry {
  return {
    category: "workflow",
    manifestPath: path.join(repoRoot, "codex_plugins/demo-plugin/.codex-plugin/plugin.json"),
    name: "demo-plugin",
    pluginPath: path.join(repoRoot, "codex_plugins/demo-plugin"),
    pointer: "/plugins/0",
    sourcePath: "./codex_plugins/demo-plugin",
  };
}

export async function writeValidPluginRepo(
  repoRoot: string,
  fixture: PluginRepoFixture = {},
): Promise<void> {
  await writeJson(
    repoRoot,
    ".agents/plugins/marketplace.json",
    fixture.marketplace ?? validMarketplace(),
  );

  await writeJson(
    repoRoot,
    "codex_plugins/demo-plugin/.codex-plugin/plugin.json",
    fixture.manifest ?? validPluginManifest(),
  );

  await writeText(
    repoRoot,
    "codex_plugins/demo-plugin/skills/hello/SKILL.md",
    typeof fixture.skillMarkdown === "string"
      ? fixture.skillMarkdown
      : validSkillMarkdown(fixture.skillMarkdown),
  );

  const openAiMetadata = fixture.openAiMetadata ?? validOpenAiMetadata();
  await writeText(
    repoRoot,
    "codex_plugins/demo-plugin/skills/hello/agents/openai.yaml",
    typeof openAiMetadata === "string" ? openAiMetadata : toYaml(openAiMetadata),
  );
}

export function toYaml(value: JsonObject): string {
  return stringifyYaml(value);
}
