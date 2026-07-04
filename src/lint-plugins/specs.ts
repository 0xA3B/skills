export const AGENT_SKILL_FRONTMATTER_KEYS = new Set([
  "allowed-tools",
  "compatibility",
  "description",
  "license",
  "metadata",
  "name",
]);

export const CLAUDE_SKILL_FRONTMATTER_KEYS = new Set(["disable-model-invocation"]);

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
