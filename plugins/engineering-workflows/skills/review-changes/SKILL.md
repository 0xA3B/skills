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

# Review changes

Review the current worktree before commit. This workflow owns scope, depth, fix policy, and
completion. Apply `engineering-workflows:reviewing-code` for lane selection, reviewer isolation, and
finding contracts.

## Outcome

Find and fix valid, in-scope issues in current changes.

## Scope

Default to staged, unstaged, and untracked non-ignored files in the current worktree. If the user
provides a path or narrow target, review only that target.

If there are no worktree changes, say so and ask whether the user wants a specific commit range or a
branch review through `engineering-workflows:review-branch`.

## Review depth

For a small, low-risk diff such as wording, comments, metadata text, or narrow configuration, do a
lightweight main-thread review: inspect the exact diff, check obvious behavior and policy risks, run
the smallest relevant validation, and report concisely.

Use the full lane workflow when the change is behavior-affecting, non-trivial, cross-cutting,
security-sensitive, release-affecting, or explicitly requested as a full review.

For every full review require the content-owning lanes the diff selects, per the Lane Selection
section of `engineering-workflows:reviewing-code`.

Use that section for conditional-lane triggers. Resolve a borderline trigger toward skipping the
lane for a pre-commit worktree review, and select spec adherence only when the user supplies the
intent source.

## Review execution

Use the coordinator role from `engineering-workflows:reviewing-code`.

## Triage and fixes

Apply `engineering-workflows:receiving-feedback` to the collected findings:

- verify before accepting;
- deduplicate findings with the same mechanism or remedy;
- classify each with the `receiving-feedback` status taxonomy.

Automatically apply accepted or auto-accepted behavior-preserving fixes within the changed surface
or directly adjacent tests and docs.

Ask about one gated finding at a time. Defer unrelated cleanup rather than expanding the worktree.

## Validation and output

Run the smallest relevant fresh validation for applied fixes. Add or update behavior-focused tests
when a fix changes behavior and a stable test seam exists.

End with scope, lanes and reviewers, fixes applied, deferred or rejected findings, validation
commands and results, and remaining decisions.
