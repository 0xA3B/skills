# Codex in Claude

Run Codex from Claude Code for adversarial code review and task delegation.

## Skills

- `codex-in-claude:adversarial-review`: Invokes Codex as a sandboxed read-only adversarial reviewer,
  has Claude triage the feedback, applies accepted in-scope fixes for current working-tree changes,
  validates the result, and summarizes the outcome.
- `codex-in-claude:using-codex-cli`: Internal contract for running the Codex CLI non-interactively —
  command recipes, sandbox modes, sessions, structured output, and GPT-5.5 prompting guidance. Used
  by the review skill and the `codex` agent; not meant for direct invocation.

## Agents

- `codex`: A general-purpose proxy agent that forwards a delegated task to `codex exec` and returns
  the result. Use it to bring Codex in as a teammate for implementation, diagnosis, or research
  tasks, or as a subagent in multi-agent workflows. Review requests belong to the
  `adversarial-review` skill instead.

## Requirements

- `codex` must be available on `PATH`.
- Codex must already be installed, authenticated, and ready to run non-interactively.

## Claude Code Support

- Claude Code loads this plugin from `.claude-plugin/plugin.json`.
- Skill content lives in `skills/` and agent definitions in `agents/` at the plugin root.
