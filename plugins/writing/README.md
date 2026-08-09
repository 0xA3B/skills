# Writing

This plugin ships writing disciplines for the documents agents and humans read, plus chat output
styles for Claude Code sessions.

An agent can invoke both skills implicitly: `agent-instructions` when a session writes or revises
agent-facing instruction files, and `documentation` when it writes or revises human-facing project
documentation.

## Skills

- `agent-instructions`: House style and document mechanics for files that instruct agents —
  `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, agent definitions, and system-prompt fragments.
- `documentation`: Simplified Technical English wording and Google developer style formatting for
  human-facing documentation — READMEs, guides, runbooks, reference prose, and release notes.

## Output styles

Output styles apply to chat responses only and materialize in Claude Code; Codex ignores them.

- `google-developer-style`: Chat responses in the spirit of the Google developer documentation style
  guide.
- `simplified-technical-english`: Chat responses in the spirit of ASD-STE100 Simplified Technical
  English.
