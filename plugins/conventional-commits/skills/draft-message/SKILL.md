---
name: draft-message
description:
  Drafts Conventional Commit message text for provided or current changes without staging or
  committing. Use when the user asks for a commit message, wants to review a message before
  committing, or needs Conventional Commit wording only.
license: MIT
disable-model-invocation: true
---

# Draft Message

Workflow skill for drafting Conventional Commit messages without mutating git state. This skill owns
change inspection, message partitioning, Conventional Commit message policy, and final message
presentation. Its successful outcome is ready-to-use commit message text for the requested changes,
plus only the assumptions needed to review that text.

Use this skill when the user wants message text only. Use `conventional-commits:commit` when the
user wants changes staged and committed.

## Invocation Behavior

- This skill is user-invoked only (`allow_implicit_invocation: false`).
- Default behavior is drafting mode: inspect relevant changes and return commit message text.
- If the repository has documented commit conventions beyond Conventional Commits, follow them.
- MUST NOT stage files, create commits, amend commits, or rewrite history.

## Success Criteria

- Drafted message text follows repository-specific rules when they are discoverable.
- One message is returned for one logical unit; multiple messages are returned only when the changes
  should be split by purpose, type, scope, or rollback boundary.
- Any weak assumption that could change type, scope, body, footer, or breaking-change handling is
  stated briefly.
- No repository state is mutated.

## Context Gathering

- Prefer user-provided summaries or diffs when they are specific enough.
- When inspecting the repository, read only the requested diff, current change summary, and nearby
  commit rules needed to draft confidently.
- When release tooling is present, inspect its config or repository docs enough to know which commit
  types, scopes, and breaking-change markers affect changelogs and version bumps.
- Stop gathering context once the message unit(s), intent, and applicable rules are clear.
- Do not keep searching for alternate wording after the message satisfies the requested output
  shape.

## Commit Message Policy

- Use the Conventional Commits shape: `<type>[optional scope][!]: <description>`.
- Prefer repository-specific commit rules over this default profile.
- Use `feat` for features, `fix` for bug fixes, and the most specific conventional type for other
  work: `docs`, `refactor`, `test`, `perf`, `style`, `build`, `ci`, `chore`, or `revert`.
- Treat type and breaking-change markers as release-affecting when the repository uses
  semantic-release, release-please, conventional-changelog, or similar tooling.
- Choose `feat`, `fix`, `!`, and `BREAKING CHANGE:` according to the repository's release rules, not
  just the apparent size of the diff.
- Choose scope by intent or stable repository vocabulary rather than blindly mirroring folder names.
- Use an imperative, lowercase subject with no trailing period unless repository rules say
  otherwise.
- Use a body for non-trivial refactors, high-risk fixes, performance work, and breaking changes.
- Use `!` and/or a `BREAKING CHANGE: <description>` footer for breaking changes; include the footer
  when structured detail would help release tooling or reviewers.
- If release tooling is present and the release impact is ambiguous, state the assumption instead of
  hiding it.
- Split message drafts when changes differ by type, scope, purpose, or rollback boundary.

## Default Workflow

1. Determine the draft target:
   - Use the user's provided summary or diff when supplied.
   - Otherwise inspect current git changes without staging anything.
2. Build a draft plan:
   - Use one message when the changes are one logical unit.
   - Use multiple messages when changes differ by type, scope, purpose, or rollback boundary.
3. Choose type, scope, body, footer, and breaking-change markers for each message.
4. Return only the drafted message or messages plus brief notes for weak assumptions.

## Optional Overrides

If the user provides extra context, apply it without switching to high-interaction mode:

- "single message" -> force one message when valid
- "only <path or concern>" -> restrict the draft target
- "skip <path or concern>" -> exclude specified scope
- "header only" -> return only the Conventional Commit header
- "with body" -> include a body when it improves clarity

## Output Format

For one message, return:

```text
<commit message>
```

For multiple messages, return:

```text
1. <commit message>
2. <commit message>
```

Add a short note after the messages only when an assumption materially affects type, scope, body, or
breaking-change handling.
