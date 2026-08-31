# Writing

This plugin ships writing disciplines for the prose agents produce: a base style for all prose, a
layered standard for technical artifacts, and a house style for files that instruct agents.

An agent can invoke all three skills implicitly: `prose` when a session composes or edits prose,
`technical-writing` when it writes or revises technical artifacts, and `agent-instructions` when it
writes or revises agent-facing instruction files or sub-agent prompts. The skills layer: `prose` is
the base style, and the other two override it for the artifacts they own.

## Skills

- `prose`: Base style for all prose — plain wording, one main claim per sentence, and a slop-pattern
  catalog — with a chat-responses reference for conversational replies.
- `technical-writing`: Diátaxis document modes, STE-inspired wording, optional controlled-language
  limits, and Google developer style formatting for technical artifacts — READMEs, guides, runbooks,
  reference prose, release notes, change descriptions, issue and ticket descriptions, and
  collaborative comments.
- `agent-instructions`: House style and document mechanics for files and prompts that instruct
  agents — `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, agent definitions, system-prompt fragments, and
  sub-agent task prompts.

To apply the base style to every session's chat responses, add a pointer line to your agent's user
memory (for example `CLAUDE.md` or `AGENTS.md`): "Apply the writing:prose skill to chat responses."
A similar pointer makes sub-agent dispatch reliable: "Load the writing:agent-instructions skill
before writing a sub-agent prompt."

## Output styles

Deprecated: the `prose` skill and its chat-responses reference replace these styles, and a memory
pointer to the skill covers both Claude Code and Codex. The files remain for reference and will be
removed in a future release.

- `google-developer-style`: Chat responses in the spirit of the Google developer documentation style
  guide.
- `simplified-technical-english`: Chat responses in the spirit of ASD-STE100 Simplified Technical
  English.
