---
name: review-changes
description: >-
  Review changes authored in the current session — worktree, staged, or work-in-progress changes, or
  the session's incremental commits up to a whole branch. Use when the user asks to review current
  changes, session changes, or review before committing or opening a PR. Applies accepted in-scope
  fixes and validates them. Do not use for reviewing work this session did not author or for
  conceptual questions about review criteria or this skill's design.
disable-model-invocation: true
argument-hint: "[path]"
---

# Review changes

Review changes this session authored, before commit or before opening a PR. This workflow owns
scope, depth, fix policy, and completion. Apply `engineering-workflows:reviewing-code` for lane
selection, reviewer isolation, and finding contracts.

The dividing line with `engineering-workflows:review-branch` is authoring context, not git shape:
use this workflow when the current session holds the authoring context for the changes, whether they
are an uncommitted diff, incremental commits, or a whole branch built this session. When the session
lacks that context — including a branch the user authored in an earlier session — hand off to
`engineering-workflows:review-branch`.

## Outcome

Find and fix valid, in-scope issues in the session's changes.

## Scope

Default to staged, unstaged, and untracked non-ignored files in the current worktree, plus any
commits this session created as part of the current effort. Diff session commits from their merge
base with the target branch, or from where this session's work began when that is narrower. If the
user provides a path or narrow target, review only that target.

If the session authored nothing — no worktree changes and no session commits — say so and ask
whether the user wants a specific commit range or a fresh-context review through
`engineering-workflows:review-branch`.

## Review depth

For a small, low-risk diff such as wording, comments, metadata text, or narrow configuration, do a
lightweight main-thread review: inspect the exact diff, check obvious behavior and policy risks, run
the smallest relevant validation, and report concisely.

Use the full lane workflow when the change is behavior-affecting, non-trivial, cross-cutting,
security-sensitive, release-affecting, or explicitly requested as a full review.

For every full review require the content-owning lanes the diff selects, per the Lane Selection
section of `engineering-workflows:reviewing-code`.

Use that section for conditional-lane triggers. Resolve a borderline trigger by the review moment:
toward skipping the lane for an incremental pre-commit check, toward selecting the lane when this
review gates a PR or merge. Select spec adherence only when the user supplies the intent source.

## Review execution

Use the coordinator role from `engineering-workflows:reviewing-code`.

## Triage and fixes

Apply `engineering-workflows:receiving-feedback` to the collected findings:

- verify before accepting;
- deduplicate findings with the same mechanism or remedy;
- classify each with the `receiving-feedback` status taxonomy.

The session's authoring context is triage context: judge findings against the decisions and
constraints from the development session, and triage autonomously instead of replaying findings to
the user. Report every rejection with its rationale; autonomy covers judging findings, not
discarding them silently.

Automatically apply accepted or auto-accepted behavior-preserving fixes within the changed surface
or directly adjacent tests and docs.

Ask about one gated finding at a time; gate by the `receiving-feedback` taxonomy, not by finding
size alone. Defer unrelated cleanup rather than expanding the worktree.

## Validation and output

Run the smallest relevant fresh validation for applied fixes. Add or update behavior-focused tests
when a fix changes behavior and a stable test seam exists.

End with scope, lanes and reviewers, fixes applied, deferred or rejected findings, validation
commands and results, and remaining decisions.
