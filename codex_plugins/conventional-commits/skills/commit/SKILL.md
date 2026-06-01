---
name: commit
description:
  Reviews current git changes, splits them into logical Conventional Commits, and executes them with
  minimal interaction. Use when the user asks to commit current work, batch commits, or run a fast
  commit workflow.
license: MIT
---

# Commit

User-invoked workflow skill for committing current repository changes quickly and consistently. This
skill owns git state inspection, commit partitioning, staging, and commit execution. Its successful
outcome is a clean sequence of repository commits that matches the user's requested scope and can be
explained briefly after execution.

This skill does not own Conventional Commit policy.
`conventional-commits:writing-conventional-commits` is the model-invoked authority for message
structure, type and scope guidance, split heuristics, and validation rules.

Use this skill when the user wants commits created. Use `conventional-commits:draft-message` when
the user wants commit message text without staging or committing.

## Invocation Behavior

- This skill is user-invoked only (`allow_implicit_invocation: false`).
- Default behavior is execution mode: review all current changes and commit them.
- It uses `conventional-commits:writing-conventional-commits` as the authoritative commit format and
  split policy.
- If the repository has documented commit conventions beyond Conventional Commits, follow them.

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
- Do not keep searching for alternative scopes or message phrasings after the commit plan is
  defensible.

## Delegation Boundaries

- This skill MUST handle:
  - Git state inspection
  - Staging and commit execution order
  - Splitting changed files or hunks into commit units
  - User-facing override interpretation such as dry runs or path restrictions
- This skill MUST delegate to `conventional-commits:writing-conventional-commits` for:
  - Commit header, body, and footer construction
  - Type and scope selection guidance
  - Breaking-change formatting guidance

## Commit Message Source

- Commit headers, bodies, and footers MUST come from
  `conventional-commits:writing-conventional-commits`.
- This skill MUST NOT introduce conflicting formatting, type, or scope rules of its own.
- Repository-specific commit rules discovered during the workflow override the default profile from
  `conventional-commits:writing-conventional-commits`.

## Default Workflow (No Extra Context)

1. Inspect all changes:
   - Staged changes
   - Unstaged tracked changes
   - Untracked files (excluding ignored files)
2. Build a commit plan:
   - Split work into logical units by purpose
   - For each unit, delegate type, scope, and breaking-change guidance to
     `conventional-commits:writing-conventional-commits`
3. Execute commits in dependency order:
   - Stage and commit one unit at a time.
   - Use elevated sandbox permissions only when the environment or repository policy requires it.
   - Repeat until all intended changes are committed
4. Return a concise summary of created commits.

## Minimal-Interaction Policy

- MUST proceed without questions when intent is clear.
- MUST treat "run commit" with no extra context as "commit all current changes."
- MAY ask one short blocking question only when safe execution is impossible:
  - merge conflicts/rebase in progress
  - ambiguous overlapping hunks that cannot be safely split
  - empty working tree

## Commit Partitioning Rules

Split commits when units differ by:

- Conventional Commit type (`feat` vs `fix`, etc.)
- scope (`api` vs `ui`, etc.)
- rollback boundary (one unit can be reverted independently)

Keep together when changes are jointly required for one behavior and should be reverted together.

## Optional Overrides

If user provides extra context, apply it without switching to high-interaction mode:

- "dry run" -> produce commit plan and messages only; do not commit
- "single commit" -> force one commit when valid
- "only <path or concern>" -> restrict commit scope
- "skip <path or concern>" -> exclude specified scope

## Safety Rules

- MUST NOT use `git commit --no-verify` unless explicitly requested.
- MUST NOT include ignored/local artifact paths unless explicitly requested.
- MUST stop and report if conflicts prevent safe commit execution.
- MUST keep staging and commit commands serialized.
