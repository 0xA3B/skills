# Writing

Writing disciplines for the documents agents and humans read, plus chat output styles for Claude
Code sessions.

`agent-instructions` may be invoked implicitly whenever a session writes or revises agent-facing
instruction files.

## Skills

- `agent-instructions`: House style and document mechanics for files that instruct agents —
  `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, agent definitions, and system-prompt fragments.

## Output Styles

Output styles apply to chat responses only and materialize in Claude Code; Codex ignores them.

- `google-developer-style`: Chat responses in the spirit of the Google developer documentation style
  guide.
- `simplified-technical-english`: Chat responses in the spirit of ASD-STE100 Simplified Technical
  English.
