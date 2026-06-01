# Conventional Commits

![Conventional Commits plugin logo](assets/logo.png)

Skills for planning, writing, validating, and executing Conventional Commits.

## Skills

- `writing-conventional-commits`: Defines the reusable Conventional Commits specification, message
  profile, split heuristics, and validation guidance. Runtime workflows reference it as
  `conventional-commits:writing-conventional-commits`.
- `draft-message`: Drafts commit message text without staging or committing, using
  `conventional-commits:writing-conventional-commits` as the commit-format source of truth.
- `commit`: Orchestrates git state inspection, commit partitioning, staging, and commit execution
  using the `conventional-commits:writing-conventional-commits` skill as the commit-format source of
  truth.

## Codex Support

- Codex loads this plugin from `.codex-plugin/plugin.json`.
- Skill content lives in `skills/` at the plugin root.
- Codex-specific skill metadata lives beside each skill in `agents/openai.yaml`.
