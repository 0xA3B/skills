# Claude in Codex

![Claude in Codex plugin logo](assets/logo.svg)

Run Claude Code from Codex for adversarial code review and task delegation.

## Skills

- `claude-in-codex:adversarial-review`: Invokes Claude Code as a read-only adversarial reviewer, has
  Codex triage the feedback, applies accepted in-scope fixes for current working-tree changes,
  validates the result, and summarizes the outcome.
- `claude-in-codex:using-claude-cli`: Internal contract for running the Claude Code CLI
  non-interactively — command recipes, sessions, structured output, and prompting guidance. Used by
  the review skill and the Claude proxy subagent; not meant for direct invocation.

## Claude as a Codex Subagent

Codex plugins cannot package subagent definitions, so this plugin ships a copyable one instead. Copy
`skills/using-claude-cli/references/claude-agent.toml` to `.codex/agents/claude.toml` in a project
(or `~/.codex/agents/claude.toml` for all projects) to let Codex spawn Claude Code as a
general-purpose proxy subagent for delegated tasks.

The definition is a work in progress: it has not been validated against a live Codex subagent load
yet, so treat it as a starting point and prefer the `adversarial-review` skill, the proven path for
running Claude from Codex today. The Claude CLI cannot run inside Codex's sandbox — it needs network
access to reach the Anthropic API and home-directory writes for session state — so the proxy runs
every `claude` command with escalated permissions, and whether Codex grants that escalation depends
on your approval policy and rules.

## Requirements

- `claude` must be available on `PATH`.
- Claude Code must already be installed, authenticated, and ready to run non-interactively.
- The Claude CLI needs network access and home-directory writes wherever it runs; from inside a
  Codex session, `claude` commands must run with escalated permissions outside the Codex sandbox.

## Codex Support

- Codex loads this plugin from `.codex-plugin/plugin.json`.
- Skill content lives in `skills/` at the plugin root.
- Codex-specific skill metadata lives beside each skill in `agents/openai.yaml`.
