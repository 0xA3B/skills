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

## Prose output style

For Claude Code, select the plugin's `prose` output style so every chat response applies the `prose`
skill's base style and chat-response rules from the system prompt. Set `outputStyle` to `prose` in a
settings file, or pick it under **Output style** in `/config`. The style keeps Claude Code's
software engineering instructions and changes only how responses are written.

For chat apps without access to installed skills, copy the body of
[`output-styles/prose.md`](output-styles/prose.md) below its frontmatter into their persistent
instructions. From a checkout of this repository, `pnpm writing:extract-chat-instructions:copy` puts
the body on the macOS clipboard.

For agents without output styles, such as Codex, add a pointer line to your user memory (for example
`AGENTS.md`): "Apply the writing:prose skill to chat responses." A similar pointer makes sub-agent
dispatch reliable on every agent: "Load the writing:agent-instructions skill before writing a
sub-agent prompt."
