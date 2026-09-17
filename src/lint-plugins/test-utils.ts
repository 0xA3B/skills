import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { createValidationContext, type Diagnostic, type ValidationContext } from "./diagnostics.js";
import type { JsonObject } from "./types.js";

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

type PortableManifestFixture = JsonObject & {
  $schema: string;
  description: string;
  extensions?: JsonObject | undefined;
  name: string;
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

type ClaudeMarketplaceFixture = JsonObject & {
  name: string;
  owner: JsonObject;
  plugins: JsonObject[];
};

type ClaudePluginManifestFixture = JsonObject & {
  description: string;
  name: string;
  version: string;
};

type PluginRepoFixture = {
  claudeManifest?: ClaudePluginManifestFixture | false;
  claudeMarketplace?: ClaudeMarketplaceFixture | false;
  marketplace?: MarketplaceFixture;
  manifest?: PortableManifestFixture;
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
        source: "./plugins/demo-plugin",
      },
    ],
    ...overrides,
  };
}

export function validCodexInterface(overrides: JsonObject = {}): JsonObject {
  return {
    capabilities: ["skills"],
    category: "workflow",
    defaultPrompt: ["Use $demo-plugin:hello."],
    developerName: "Test Developer",
    displayName: "Demo Plugin",
    longDescription: "A plugin used by lint tests.",
    shortDescription: "Demo plugin",
    ...overrides,
  };
}

export function validPortableManifest(
  overrides: Partial<PortableManifestFixture> = {},
): PortableManifestFixture {
  return {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    description: "Demo plugin",
    extensions: { "com.openai": { interface: validCodexInterface() } },
    name: "demo-plugin",
    version: "1.0.0",
    ...overrides,
  };
}

export function validSkillMarkdown(overrides: Partial<SkillMarkdownFixture> = {}): string {
  const fixture: SkillMarkdownFixture = {
    body: "# Hello\n\nFollow the test fixture instructions.",
    frontmatter: {
      description: "Use when a test needs a valid skill fixture.",
      "disable-model-invocation": true,
      metadata: { source: "fixture" },
      name: "hello",
    },
    ...overrides,
  };

  return `---\n${toYaml(fixture.frontmatter)}---\n${fixture.body ?? ""}\n`;
}

export function validClaudeMarketplace(
  overrides: Partial<ClaudeMarketplaceFixture> = {},
): ClaudeMarketplaceFixture {
  return {
    name: "test-marketplace",
    owner: { name: "Test Developer" },
    plugins: [
      {
        name: "demo-plugin",
        source: "./plugins/demo-plugin",
      },
    ],
    ...overrides,
  };
}

export function validClaudePluginManifest(
  overrides: Partial<ClaudePluginManifestFixture> = {},
): ClaudePluginManifestFixture {
  return {
    description: "Demo plugin",
    displayName: "Demo Plugin",
    name: "demo-plugin",
    version: "1.0.0",
    ...overrides,
  };
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
    "plugins/demo-plugin/plugin.json",
    fixture.manifest ?? validPortableManifest(),
  );

  if (fixture.claudeMarketplace !== false) {
    await writeJson(
      repoRoot,
      ".claude-plugin/marketplace.json",
      fixture.claudeMarketplace ?? validClaudeMarketplace(),
    );
  }

  if (fixture.claudeManifest !== false) {
    await writeJson(
      repoRoot,
      "plugins/demo-plugin/.claude-plugin/plugin.json",
      fixture.claudeManifest ?? validClaudePluginManifest(),
    );
  }

  await writeText(
    repoRoot,
    "plugins/demo-plugin/skills/hello/SKILL.md",
    typeof fixture.skillMarkdown === "string"
      ? fixture.skillMarkdown
      : validSkillMarkdown(fixture.skillMarkdown),
  );

  const openAiMetadata = fixture.openAiMetadata ?? validOpenAiMetadata();
  await writeText(
    repoRoot,
    "plugins/demo-plugin/skills/hello/agents/openai.yaml",
    typeof openAiMetadata === "string" ? openAiMetadata : toYaml(openAiMetadata),
  );
}

export function toYaml(value: JsonObject): string {
  return stringifyYaml(value);
}
