# Claude in Codex

![Claude in Codex plugin logo](assets/logo.svg)

Run Claude Code from Codex for adversarial code review.

## Skills

- `claude-in-codex:adversarial-review`: Invokes Claude Code as a read-only adversarial reviewer, has
  Codex triage the feedback, applies accepted in-scope fixes for current working-tree changes,
  validates the result, and summarizes the outcome.

## Requirements

- `claude` must be available on `PATH`.
- Claude Code must already be installed, authenticated, and ready to run non-interactively.

## Codex Support

- Codex loads this plugin from `.codex-plugin/plugin.json`.
- Skill content lives in `skills/` at the plugin root.
- Codex-specific skill metadata lives beside each skill in `agents/openai.yaml`.
