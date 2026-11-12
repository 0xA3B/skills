---
name: update-plugin-metadata
description: >-
  Use when asked to change plugin metadata in this repository: a plugin's description, default
  prompts, author, category, keywords, or version, its marketplace entries or README summary, or a
  skill's Codex UI metadata in `agents/openai.yaml`. Do not use to tune a skill `description` as a
  trigger contract (optimize-trigger).
license: MIT
argument-hint: "[plugin]"
---

# Update plugin metadata

Keep a plugin's metadata consistent across its metadata surfaces: the portable manifest, the target
extensions, the marketplace catalogs, the README files, and each skill's Codex UI metadata.
`plugins/AGENTS.md` owns the manifest conventions, the default prompt policy, invocation-policy
parity, and the plugin version policy this workflow applies.

## Outcome

Finish with every metadata surface the request affects changed together, and validation passing.

If the request implies a plugin rename, a schema change, or a new skill body, change only the
surfaces that stay valid without that work and report the rest; a new skill belongs to `add-skill`.

## Workflow

1. Identify the target plugins. Read each one's portable manifest, target extensions, and
   marketplace entries before editing.
2. List the fields the request changes, and every surface that carries each field.
3. Change those surfaces together. Keep each schema's field names and shapes. Take a name, summary,
   prompt, or category the request does not supply from the plugin directory and its existing
   metadata; do not invent one.
4. Apply the plugin version policy in `plugins/AGENTS.md` to the change.
5. Run `mise exec -- pnpm lint:plugins` and `mise exec -- pnpm format:check`. When the change
   touched validation tooling, also run `mise exec -- pnpm lint` and `mise exec -- pnpm typecheck`.

## Consistency rules

- Keep plugin `name`, `version`, `description`, `author`, `repository`, and `keywords` aligned
  across the portable manifest, the Claude extension, the marketplace catalogs, and the plugin
  directory; the portable manifest is authoritative.
- Keep README skill lists aligned with the directories under `plugins/<plugin-name>/skills/`.

## Boundaries

- Commit only when the user asks.
