export const AGENT_SKILL_FRONTMATTER_KEYS = new Set([
  "allowed-tools",
  "compatibility",
  "description",
  "license",
  "metadata",
  "name",
]);

export const CLAUDE_SKILL_FRONTMATTER_KEYS = new Set([
  "agent",
  "argument-hint",
  "arguments",
  "context",
  "disable-model-invocation",
  "disallowed-tools",
  "effort",
  "hooks",
  "model",
  "paths",
  "shell",
  "user-invocable",
  "when_to_use",
]);

export const CLAUDE_SKILL_EFFORT_VALUES = new Set(["low", "medium", "high", "xhigh", "max"]);

export const CLAUDE_SKILL_CONTEXT_VALUES = new Set(["fork"]);

export const CLAUDE_SKILL_SHELL_VALUES = new Set(["bash", "powershell"]);

export const CLAUDE_SKILL_LISTING_MAX_LENGTH = 1536;

export const CLAUDE_MARKETPLACE_ROOT_KEYS = new Set([
  "$schema",
  "description",
  "name",
  "owner",
  "plugins",
]);

export const CLAUDE_MARKETPLACE_OWNER_KEYS = new Set(["email", "name", "url"]);

export const CLAUDE_MARKETPLACE_PLUGIN_KEYS = new Set(["description", "name", "source"]);

export const CLAUDE_PLUGIN_MANIFEST_KEYS = new Set([
  "$schema",
  "author",
  "description",
  "displayName",
  "homepage",
  "keywords",
  "license",
  "name",
  "repository",
  "version",
]);

export const CLAUDE_PLUGIN_AUTHOR_KEYS = new Set(["email", "name", "url"]);

export const OPENAI_METADATA_ROOT_KEYS = new Set([
  "dependencies",
  "interface",
  "policy",
  "version",
]);

export const OPENAI_METADATA_INTERFACE_KEYS = new Set([
  "brand_color",
  "default_prompt",
  "display_name",
  "icon_large",
  "icon_small",
  "short_description",
]);

export const OPENAI_METADATA_POLICY_KEYS = new Set(["allow_implicit_invocation"]);

// Agent Plugins 1.0.0 portable manifest (plugin.json at the plugin root). Source of every rule:
// https://agent-plugins.org/schemas/1.0.0/plugin.schema.json, normative text at
// https://agent-plugins.org/specification. The schema is closed (additionalProperties: false), so
// PORTABLE_MANIFEST_KEYS is the complete key set; only $schema and name are required by the spec.
export const PORTABLE_MANIFEST_SCHEMA_URL =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

export const PORTABLE_MANIFEST_KEYS = new Set([
  "$schema",
  "author",
  "description",
  "extensions",
  "homepage",
  "keywords",
  "license",
  "name",
  "repository",
  "version",
]);

export const PORTABLE_MANIFEST_AUTHOR_KEYS = new Set(["email", "name", "url"]);

// plugin.schema.json name: minLength 1, maxLength 64, pattern below (verbatim).
export const PORTABLE_MANIFEST_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export const PORTABLE_MANIFEST_NAME_MAX_LENGTH = 64;

// Codex reads its plugin metadata from the extensions.com.openai namespace of the portable
// manifest. Source: https://developers.openai.com/codex/plugins/build ("Put OpenAI-specific
// presentation, registered MCP server mappings, and hook settings under extensions.com.openai");
// no JSON Schema is published for the namespace, so the key set follows that page's example.
export const CODEX_EXTENSION_NAMESPACE = "com.openai";

export const CODEX_EXTENSION_KEYS = new Set(["apps", "hooks", "interface"]);
