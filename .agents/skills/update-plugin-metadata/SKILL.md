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

# Update plugin metadata

Repo-local workflow for keeping plugin metadata consistent across the Claude Code and Codex
marketplaces.

## Outcome

Update all metadata surfaces affected by the request while preserving this repo's schemas and
keeping plugin discovery, README summaries, skill UI metadata, and default prompts consistent.

Stop when the affected surfaces are aligned and validation has passed. If the requested metadata
change implies a plugin rename, schema change, or new skill body, update only the safe surfaces and
report the remaining work instead of guessing.

## Source of truth

- Follow `plugins/AGENTS.md` for manifest conventions, metadata placement, the default prompt
  policy, invocation-policy parity, and the plugin version policy; do not restate them here.
- Plugin README files and the root `README.md` carry the user-facing plugin summaries.

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

9. When validation tooling changed, run `mise exec -- pnpm lint` and `mise exec -- pnpm typecheck`.

## Consistency rules

- Keep plugin `name`, `version`, `description`, `author`, `repository`, `keywords`, and `skills`
  aligned across the plugin manifests, marketplace catalogs, and plugin directory.
- Keep README skill lists aligned with actual `plugins/<plugin-name>/skills/` directories.

## Boundaries

- Do not add a new skill body; use `add-skill`.
- Do not add a scaffold script or template unless the user explicitly asks for plugin creation
  automation.
- Do not commit changes unless the user asks.
