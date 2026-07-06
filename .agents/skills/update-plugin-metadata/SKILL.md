---
name: update-plugin-metadata
description:
  Updates marketplace plugin metadata, marketplace entries, README files, and skill UI metadata in
  this repository. Use when the user asks to revise plugin descriptions, prompts, authorship,
  categories, keywords, versions, or metadata consistency. Do not use for editing skill body
  instructions in SKILL.md, or for tuning a skill description as a trigger contract; trigger
  behavior belongs to optimize-trigger.
license: MIT
argument-hint: "[plugin]"
---

# Update Plugin Metadata

Repo-local workflow for keeping plugin metadata consistent across the Claude Code and Codex
marketplaces.

## Outcome

Update all metadata surfaces affected by the request while preserving this repo's schemas and
keeping plugin discovery, README summaries, skill UI metadata, and default prompts consistent.

Stop when the affected surfaces are aligned and validation has passed. If the requested metadata
change implies a plugin rename, schema change, or new skill body, update only the safe surfaces and
report the remaining work instead of guessing.

## Source Of Truth

- Follow `plugins/AGENTS.md` for manifest conventions and skill metadata placement.
- Codex plugin metadata lives in `plugins/<plugin-name>/.codex-plugin/plugin.json`; Claude Code
  plugin metadata lives in `plugins/<plugin-name>/.claude-plugin/plugin.json`.
- Codex marketplace entries live in `.agents/plugins/marketplace.json`; Claude Code marketplace
  entries live in `.claude-plugin/marketplace.json`.
- Skill-level Codex UI metadata lives in
  `plugins/<plugin-name>/skills/<skill-name>/agents/openai.yaml`.
- Skill-level Claude Code invocation policy lives in `SKILL.md` frontmatter
  (`disable-model-invocation`).
- Plugin README files carry user-facing plugin summaries.
- Plugin version changes follow the version policy in `plugins/AGENTS.md`.

## Workflow

1. Identify the target plugin or plugins.
2. Read the plugin manifest and marketplace entry before editing.
3. Determine whether the request changes plugin name, version, description, author, repository,
   keywords, category, prompts, skill display names, skill descriptions, invocation policy, or
   README-visible summaries.
4. Determine whether the change is content-only, additive, narrowing, or compatibility-affecting,
   then apply the plugin version policy.
5. Update all affected metadata surfaces together.
6. Preserve schema-specific field names and shapes; do not normalize them into a different
   structure.
7. When evidence is missing, inspect the actual plugin directories and existing metadata before
   inventing names, summaries, prompts, or categories.
8. Run validation:

   ```bash
   mise exec -- pnpm lint:plugins
   mise exec -- pnpm format:check
   ```

9. Run `mise exec -- pnpm lint` and `mise exec -- pnpm typecheck` when validation tooling changed.

## Consistency Rules

- Keep plugin `name`, `version`, `description`, `author`, `repository`, `keywords`, and `skills`
  aligned across the plugin manifests, marketplace catalogs, and plugin directory.
- Keep README skill lists aligned with actual `plugins/<plugin-name>/skills/` directories.
- Apply the default prompt policy, invocation-policy parity rules, and plugin version policy from
  `plugins/AGENTS.md` instead of restating or reinventing them here.

## Boundaries

- Do not add a new skill body; use `add-skill`.
- Do not add a scaffold script or template unless the user explicitly asks for plugin creation
  automation.
- Do not commit changes unless the user asks.
