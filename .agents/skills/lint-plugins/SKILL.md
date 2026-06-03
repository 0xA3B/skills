---
name: lint-plugins
description:
  Lints Codex marketplace plugin structure, manifests, skill metadata, formatting, linting, and type
  checks in this repository. Use when the user asks to check a plugin, verify metadata, run plugin
  linting, or confirm plugin changes are ready.
license: MIT
---

# Lint Plugins

Repo-local workflow for linting plugin and skill-authoring changes.

## Outcome

Run the smallest validation set that proves the current plugin or skill change is ready, fix clear
failures caused by the change, and report exactly what passed or what remains blocked.

Stop when the relevant checks pass. If a failure is unrelated, destructive to fix, or requires a
product decision, report it without broadening the change.

## Source Of Truth

- `mise exec -- pnpm lint:plugins` lints the marketplace catalog, plugin manifests, skill
  frontmatter, and skill `agents/openai.yaml` metadata.
- `mise exec -- pnpm format:check` validates supported Markdown, JSON, YAML, and TypeScript
  formatting.
- `mise exec -- pnpm lint` runs Oxlint on TypeScript.
- `mise exec -- pnpm typecheck` runs TypeScript type checking.
- `mise exec -- pnpm check` runs the full format, lint, typecheck, and plugin linting gate.
- `codex_plugins/AGENTS.md` defines plugin structure and compatibility rules.

## Workflow

1. Inspect current changes with `git status --short`.
2. Choose checks from the files changed and the requested confidence level. Start with plugin
   linting for plugin or skill metadata changes:

   ```bash
   mise exec -- pnpm lint:plugins
   ```

3. Run format validation when Markdown, JSON, YAML, TypeScript, or skill files changed:

   ```bash
   mise exec -- pnpm format:check
   ```

4. Run TypeScript validation when scripts, validators, package config, or CI changed:

   ```bash
   mise exec -- pnpm lint
   mise exec -- pnpm typecheck
   ```

5. For broad repo changes or pre-commit readiness, run:

   ```bash
   mise exec -- pnpm check
   ```

6. If a check fails, fix the issue when the cause is clear and rerun only the failed or affected
   checks.
7. Report checks run, pass/fail result, files changed by any formatter, and remaining risks or
   skipped checks.

## Boundaries

- Do not stage or commit changes unless the user asks.
- Do not use unsafe lint fixes.
- Do not hide formatter changes; report them in the final answer.
