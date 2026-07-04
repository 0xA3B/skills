---
name: commit
description:
  Creates git commits using Conventional Commit messages after reviewing current changes and
  splitting logical units. Use when the user asks to commit current work, create commits, batch
  commits, or run a fast commit workflow, and neither the prompt nor loaded repository instructions
  require a different commit-message standard. Also use when no repository convention is specified,
  because Conventional Commits are this plugin's default. Do not use for message-only drafting,
  syntax validation, split guidance without commit execution, conceptual commit questions, history
  inspection, user prompts or loaded repository instructions that reject Conventional Commits or
  request Gitmoji or another commit-message standard, or ordinary-language uses of "commit" such as
  committing to a plan.
license: MIT
---

# Commit

Workflow skill for committing current repository changes quickly and consistently. This skill owns
git state inspection, commit partitioning, Conventional Commit message policy, staging, and commit
execution. Its successful outcome is a clean sequence of repository commits that matches the user's
requested scope and can be explained briefly after execution.

Use this skill when the user wants commits created. Use `conventional-commits:draft-message` when
the user wants commit message text without staging or committing.

## Invocation Behavior

- This skill may be implicitly invoked when the user asks to create git commits.
- Default behavior is execution mode: review all current changes and commit them.
- If the user asks for a dry run, message draft, split guidance without execution, syntax check, or
  conceptual explanation, do not create commits.
- If the user prompt or loaded repository instructions ask not to use Conventional Commits or
  require another commit-message standard such as Gitmoji, do not invoke this skill.
- If the user uses "commit" to mean agree, decide, or commit to a plan, do not invoke this skill.
- If the repository has documented commit conventions beyond Conventional Commits, follow them.
- Load `references/conventional-commits.md` only when detailed specification rules, examples, footer
  edge cases, or anti-patterns are needed.

## Success Criteria

- The intended changes are committed, or a precise blocker is reported.
- Each commit has one logical purpose, one rollback boundary, and a valid Conventional Commit
  message.
- Repository-specific commit rules, hooks, and sandbox requirements are respected.
- The final response names the created commit(s) and any files intentionally left uncommitted.

## Context Gathering

- Start with the smallest useful git state inspection for the requested scope.
- Read repository commit rules only when they are likely to exist or are referenced by hooks,
  config, docs, or the user.
- Stop gathering context once the changed units, applicable commit rules, and safety constraints are
  clear enough to commit.
- When release tooling is present, inspect its config or repository docs enough to know which commit
  types, scopes, and breaking-change markers affect changelogs and version bumps.
- Do not keep searching for alternative scopes or message phrasings after the commit plan is
  defensible.

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
- Keep headers near 72 characters when practical.
- Use a body for non-trivial refactors, high-risk fixes, performance work, and breaking changes.
- Use `!` and/or a `BREAKING CHANGE: <description>` footer for breaking changes; include the footer
  when release tooling or reviewers need structured detail.
- Return warnings only for assumptions that could change type, scope, body, footer, breaking-change
  handling, or commit partitioning.
- If release tooling is present and the release impact is ambiguous, report the assumption before
  committing.

## Commit Partitioning Rules

Split commits when units differ by:

- Conventional Commit type (`feat` vs `fix`, etc.)
- scope (`api` vs `ui`, etc.)
- rollback boundary (one unit can be reverted independently)

Keep together when changes are jointly required for one behavior and should be reverted together.

## Default Workflow

1. Inspect all changes:
   - Staged changes
   - Unstaged tracked changes
   - Untracked files, excluding ignored files
2. Build a commit plan:
   - Split work into logical units by purpose and rollback boundary
   - Choose type, scope, body, and footer for each unit
3. Execute commits in dependency order:
   - Stage and commit one unit at a time
   - Use elevated sandbox permissions only when the environment or repository policy requires it
   - Repeat until all intended changes are committed
4. Return a concise summary of created commits.

## Minimal-Interaction Policy

- Proceed without questions when intent is clear.
- Treat "run commit" with no extra context as "commit all current changes."
- Surface blockers only when safe execution is impossible:
  - merge conflicts or rebase in progress
  - ambiguous overlapping hunks that cannot be safely split
  - empty working tree

## Optional Overrides

If user provides extra context, apply it without switching to high-interaction mode:

- "dry run" -> produce commit plan and messages only; do not commit
- "single commit" -> force one commit when valid
- "only <path or concern>" -> restrict commit scope
- "skip <path or concern>" -> exclude specified scope

## Safety Rules

- Do not use `git commit --no-verify` unless explicitly requested.
- Do not include ignored/local artifact paths unless explicitly requested.
- Stop and report if conflicts prevent safe commit execution.
- Keep staging and commit commands serialized.
