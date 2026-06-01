---
name: draft-message
description:
  Drafts Conventional Commit message text for provided or current changes without staging or
  committing. Use when the user asks for a commit message, wants to review a message before
  committing, or needs Conventional Commit wording only.
license: MIT
---

# Draft Message

User-invoked workflow skill for drafting Conventional Commit messages without mutating git state.
This skill owns change inspection, intent clarification, and final message presentation. Its
successful outcome is ready-to-use commit message text for the requested changes, plus only the
assumptions needed to review that text.

This skill does not own Conventional Commit policy.
`conventional-commits:writing-conventional-commits` is the model-invoked authority for message
structure, type and scope guidance, split heuristics, and validation rules.

Use this skill when the user wants message text only. Use `conventional-commits:commit` when the
user wants changes staged and committed.

## Invocation Behavior

- This skill is user-invoked only (`allow_implicit_invocation: false`).
- Default behavior is drafting mode: inspect relevant changes and return commit message text.
- It uses `conventional-commits:writing-conventional-commits` as the authoritative commit format and
  split policy.
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
- Stop gathering context once the message unit(s), intent, and applicable rules are clear.
- Do not keep searching for alternate wording after the message satisfies the requested output
  shape.

## Delegation Boundaries

- This skill MUST handle:
  - Reading the requested diff, file list, or user-provided change summary
  - Determining whether one message or multiple messages are needed
  - Presenting draft messages for user review
  - Interpreting user-facing overrides such as single-message or path-restricted drafts
- This skill MUST delegate to `conventional-commits:writing-conventional-commits` for:
  - Commit header, body, and footer construction
  - Type and scope selection guidance
  - Breaking-change formatting guidance

## Default Workflow

1. Determine the draft target:
   - Use the user's provided summary or diff when supplied.
   - Otherwise inspect current git changes without staging anything.
2. Build a draft plan:
   - Use one message when the changes are one logical unit.
   - Use multiple messages when changes differ by type, scope, or rollback boundary.
3. For each message, delegate type, scope, body, footer, and breaking-change decisions to
   `conventional-commits:writing-conventional-commits`.
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
