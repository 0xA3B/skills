---
name: commit
description:
  Creates git commits using Conventional Commit messages after reviewing current changes and
  splitting logical units. Use when the user asks to commit current work, create commits, batch
  commits, commit only a selected scope or subset of the changes, or run a fast commit workflow.
  Also use when no repository commit convention is specified. Do not use for message-only drafting,
  syntax validation, split guidance without commit execution, conceptual commit questions, history
  inspection, user prompts or loaded repository instructions that reject Conventional Commits or
  request Gitmoji or another commit-message standard, or ordinary-language uses of "commit" such as
  committing to a plan.
license: MIT
argument-hint: "[instructions]"
---

# Commit

## Success criteria

- The intended changes are committed, or a precise blocker is reported.
- Each commit has one logical purpose, one rollback boundary, and a valid Conventional Commit
  message.
- Repository-specific commit rules, hooks, and sandbox requirements are respected.

## Context gathering

- Start with the smallest useful git state inspection for the requested scope.
- Read repository commit rules when the user names them, or when the repository contains a
  commitlint config, a commit-msg hook, or a CONTRIBUTING, AGENTS, or CLAUDE file that mentions
  commits.
- When release tooling is present, inspect its config or repository docs enough to know which commit
  types, scopes, and breaking-change markers affect changelogs and version bumps.
- Stop gathering context at the first defensible commit plan — one where the changed units,
  applicable commit rules, and safety constraints are clear enough to commit.

## Commit message policy

- Write standard Conventional Commit messages: `<type>[optional scope][!]: <description>` with an
  imperative subject. Load `references/conventional-commits.md` for detailed specification rules,
  examples, footer edge cases, or anti-patterns rather than guessing.
- Prefer repository-specific commit rules over this default profile.
- Choose `feat`, `fix`, `!`, and `BREAKING CHANGE:` by release impact, not by the apparent size of
  the diff: when semantic-release, release-please, conventional-changelog, or similar tooling is
  present, its changelog and version-bump rules decide. If the release impact is ambiguous, report
  the assumption before committing.
- Choose scope by intent or stable repository vocabulary rather than blindly mirroring folder names.
- Name the resulting behavior, boundary, or user-visible outcome in the subject. Use a generic verb
  such as `update`, `tune`, or `refine` only when a more specific result would be misleading.
- Add bodies and issue or ticket footers only for durable context specific to the commit. Do not
  restate the diff or copy a change request's overall reference to every commit. Keep identifiers
  out of the subject unless repository policy requires them; use the reference above for selection
  rules and syntax.
- Return warnings only for assumptions that could change type, scope, body, footer, breaking-change
  handling, or commit partitioning.

## Commit partitioning rules

Split commits when units differ by:

- Conventional Commit type (`feat` vs `fix`, etc.)
- scope (`api` vs `ui`, etc.)
- rollback boundary (one unit can be reverted independently)

Keep together when changes are jointly required for one behavior and should be reverted together.

## Default workflow

Default to execution mode: review all current changes and commit them. If the user asked for a dry
run, a message draft, or split guidance without execution, produce the plan and messages and stop
before staging.

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
4. Report every created commit and every file intentionally left uncommitted.

## Minimal-interaction policy

- Proceed without questions when intent is clear.
- Treat "run commit", "commit all", "commit everything", or equivalent wording with no named scope
  as "commit all coherent current work for this task." Exclude unrelated, pre-existing, and
  local-only artifacts. Include generated outputs when the coherent work or repository policy
  requires them, and report each path left uncommitted.
- Surface blockers only when safe execution is impossible:
  - merge conflicts or rebase in progress
  - ambiguous overlapping hunks that cannot be safely split
  - empty working tree

## Optional overrides

If user provides extra context, apply it without switching to high-interaction mode:

- "dry run" -> produce commit plan and messages only; do not commit
- "single commit" -> force one commit when valid
- "only <path or concern>" -> restrict commit scope
- "skip <path or concern>" -> exclude specified scope

## Safety rules

- Do not use `git commit --no-verify` unless explicitly requested.
- Stage tracked paths and non-ignored untracked paths only. If the user names an ignored untracked
  path, identify the matching ignore rule and report that repository policy must change before the
  path can be committed; do not force-add it.
- Before rewriting any commit, determine whether the affected history was published. When rewriting
  a non-`HEAD` commit, preserve unrelated later commits. Verify the rewritten range and report the
  replaced and resulting commit identifiers. Require explicit authorization before force-pushing
  rewritten published history, and use `--force-with-lease` when authorized.
- Stop and report if conflicts prevent safe commit execution.
- Keep staging and commit commands serialized.
