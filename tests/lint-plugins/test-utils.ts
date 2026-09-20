import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import {
  createValidationContext,
  type Diagnostic,
  type ValidationContext,
} from "../../src/lint-plugins/diagnostics.js";
import type { JsonObject, PluginTargets } from "../../src/lint-plugins/types.js";

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

type SkillFixture = {
  name?: string;
  pluginName?: string;
  implicit?: boolean;
  openAiMetadata?: OpenAiMetadataFixture | string | false;
  skillMarkdown?: SkillMarkdownFixture | string;
};

type PluginFixture = {
  name?: string;
  targets?: PluginTargets;
  skillName?: string;
  implicit?: boolean;
  claudeManifest?: ClaudePluginManifestFixture | false;
  manifest?: PortableManifestFixture;
  openAiMetadata?: SkillFixture["openAiMetadata"];
  skillMarkdown?: SkillFixture["skillMarkdown"];
};

type PluginRepoFixture = PluginFixture & {
  claudeMarketplace?: ClaudeMarketplaceFixture | false;
  marketplace?: MarketplaceFixture;
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
  return createValidationContext({ repoRoot });
}

// Validator emission order is incidental. Sorted arrays retain duplicate findings;
// output ordering belongs to the CLI contract instead.
export function ruleIds(context: ValidationContext): string[] {
  return context.diagnostics.map((diagnostic) => diagnostic.ruleId).sort();
}

export function diagnosticPointers(context: ValidationContext, ruleId: string): string[] {
  return context.diagnostics
    .filter((diagnostic) => diagnostic.ruleId === ruleId)
    .map((diagnostic) => diagnostic.pointer ?? "")
    .sort();
}

export function diagnosticByRule(
  context: ValidationContext,
  ruleId: string,
  location: { pointer?: string; filePath?: string } = {},
): Diagnostic | undefined {
  const matches = context.diagnostics.filter(
    (diagnostic) =>
      diagnostic.ruleId === ruleId &&
      (location.pointer === undefined || diagnostic.pointer === location.pointer) &&
      (location.filePath === undefined || diagnostic.filePath === location.filePath),
  );
  if (matches.length > 1) {
    throw new Error(`Ambiguous diagnostic ${ruleId}; select its pointer and file path.`);
  }
  return matches[0];
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
  const name = fixture.name ?? "demo-plugin";
  const targets = fixture.targets ?? { claude: true, codex: true };
  await writeJson(
    repoRoot,
    ".agents/plugins/marketplace.json",
    fixture.marketplace ??
      validMarketplace({
        plugins: targets.codex
          ? [
              {
                ...validMarketplace().plugins[0]!,
                name,
                source: `./plugins/${name}`,
              },
            ]
          : [],
      }),
  );

  if (
    fixture.claudeMarketplace !== false &&
    (targets.claude || fixture.claudeMarketplace !== undefined)
  ) {
    await writeJson(
      repoRoot,
      ".claude-plugin/marketplace.json",
      fixture.claudeMarketplace ??
        validClaudeMarketplace({
          plugins: [{ name, source: `./plugins/${name}` }],
        }),
    );
  }

  await writePlugin(repoRoot, fixture);
}

// Writes shipped files only. Catalog declarations remain independent so tests can express
// unlisted plugins, aliases, and duplicate entries without the fixture repairing them.
export async function writePlugin(repoRoot: string, fixture: PluginFixture = {}): Promise<void> {
  const name = fixture.name ?? "demo-plugin";
  const skillName = fixture.skillName ?? "hello";
  const targets = fixture.targets ?? { claude: true, codex: true };
  await writeJson(
    repoRoot,
    `plugins/${name}/plugin.json`,
    fixture.manifest ??
      validPortableManifest({
        name,
        extensions: targets.codex
          ? {
              "com.openai": {
                interface: validCodexInterface({ defaultPrompt: [`Use $${name}:${skillName}.`] }),
              },
            }
          : undefined,
      }),
  );

  if (
    fixture.claudeManifest !== false &&
    (targets.claude || fixture.claudeManifest !== undefined)
  ) {
    await writeJson(
      repoRoot,
      `plugins/${name}/.claude-plugin/plugin.json`,
      fixture.claudeManifest ?? validClaudePluginManifest({ name }),
    );
  }

  await writeSkill(repoRoot, {
    name: skillName,
    pluginName: name,
    implicit: fixture.implicit ?? false,
    ...(targets.codex ? {} : { openAiMetadata: false as const }),
    ...(fixture.openAiMetadata === undefined ? {} : { openAiMetadata: fixture.openAiMetadata }),
    ...(fixture.skillMarkdown === undefined ? {} : { skillMarkdown: fixture.skillMarkdown }),
  });
}

export async function writeSkill(repoRoot: string, fixture: SkillFixture = {}): Promise<string> {
  const name = fixture.name ?? "hello";
  const skillPath =
    fixture.pluginName === undefined
      ? `.agents/skills/${name}`
      : `plugins/${fixture.pluginName}/skills/${name}`;
  const label = fixture.pluginName === undefined ? name : `${fixture.pluginName}:${name}`;
  await writeText(
    repoRoot,
    `${skillPath}/SKILL.md`,
    typeof fixture.skillMarkdown === "string"
      ? fixture.skillMarkdown
      : validSkillMarkdown(
          fixture.skillMarkdown ?? {
            frontmatter: {
              name,
              description: "Use when a test needs a valid skill fixture.",
              "disable-model-invocation": !(fixture.implicit ?? false),
            },
          },
        ),
  );

  const openAiMetadata =
    fixture.openAiMetadata ??
    validOpenAiMetadata({
      interface: { ...validOpenAiMetadata().interface, default_prompt: `Use $${label}.` },
      policy: { allow_implicit_invocation: fixture.implicit ?? false },
    });
  if (openAiMetadata !== false) {
    await writeText(
      repoRoot,
      `${skillPath}/agents/openai.yaml`,
      typeof openAiMetadata === "string" ? openAiMetadata : toYaml(openAiMetadata),
    );
  }
  return path.join(repoRoot, skillPath);
}

export function toYaml(value: JsonObject): string {
  return stringifyYaml(value);
}
