# Conventional Commits

![Conventional Commits plugin logo](assets/logo.png)

Skills for drafting and creating Conventional Commits.

## Skills

- `commit`: Orchestrates git state inspection, commit partitioning, Conventional Commit message
  policy, staging, and commit execution. Detailed specification notes live in
  `skills/commit/references/`.
- `draft-message`: Drafts commit message text without staging or committing.

## Codex Support

- Codex loads this plugin from `.codex-plugin/plugin.json`.
- Skill content lives in `skills/` at the plugin root.
- Codex-specific skill metadata lives beside each skill in `agents/openai.yaml`.
