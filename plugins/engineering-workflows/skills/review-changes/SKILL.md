---
name: review-changes
description: >-
  Review current worktree, WIP, staged, or narrow pre-commit changes after a coding session. Use
  when the user asks to review current changes, worktree changes, staged changes, work-in-progress
  changes, or review before committing. Applies accepted in-scope fixes and validates them. Do not
  use for conceptual questions about review criteria or this skill's design.
disable-model-invocation: true
argument-hint: "[path]"
---

# Review Changes

Review the current worktree before commit. This workflow owns review scope, depth, fix policy, and
completion. Apply `engineering-workflows:reviewing-code` for lane selection, reviewer isolation, and
finding contracts.

## Outcome

Find and fix valid, in-scope issues in current changes. Finish with accepted fixes, deferred or
rejected findings, and fresh validation evidence.

## Scope

Default to staged, unstaged, and untracked non-ignored files in the current worktree. If the user
provides a path or narrow target, review only that target.

If there are no worktree changes, say so and ask whether the user wants a commit or branch review.
Do not silently broaden into `review-branch`.

## Review Depth

For a small, low-risk diff such as wording, comments, metadata text, or narrow configuration, do a
lightweight main-thread review: inspect the exact diff, check obvious behavior and policy risks, run
the smallest relevant validation, and report concisely.

Use the full lane workflow when the change is behavior-affecting, non-trivial, cross-cutting,
security-sensitive, release-affecting, or explicitly requested as a full review.

For every full review require:

- `code review`;
- `simplification`.

Add conditional lanes through `reviewing-code` only when the changed surface justifies them. Be
conservative about extra lanes for a pre-commit worktree review:

- codebase design for structural or cross-module changes;
- API/seam for a new or materially changed public interface;
- test review for substantial test changes or high-risk test strategy;
- spec adherence when the user supplies a source of intended behavior.

## Review Execution

Use the coordinator mode from `engineering-workflows:reviewing-code`. When subagents are permitted,
give each required lane an independent reviewer if this session authored the changes. If reviewers
are unavailable, complete the strongest local review and state that independence was unavailable.

Do not ask lane reviewers to apply fixes or broaden scope.

## Triage And Fixes

Apply `engineering-workflows:receiving-feedback` to the collected findings:

- verify before accepting;
- deduplicate findings with the same mechanism or remedy;
- classify each as accepted, auto-accepted, needs-clarification, gated, deferred, or rejected.

Automatically apply accepted or auto-accepted behavior-preserving fixes within the changed surface
or directly adjacent tests and docs.

Ask about one finding at a time when it changes intended behavior, public interfaces, data models,
dependencies, migrations, security policy, broad architecture, or prior user direction. Defer
unrelated cleanup rather than expanding the worktree.

## Validation And Output

Run the smallest relevant fresh validation for applied fixes. Add or update behavior-focused tests
when a fix changes behavior and a stable test seam exists.

End with scope, lanes and reviewers, fixes applied, deferred or rejected findings, validation
commands and results, and remaining decisions.
