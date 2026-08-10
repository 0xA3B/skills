---
name: review-branch
description: >-
  Review a branch, WIP branch, PR, MR, or branch-vs-base diff before merge. Runs focused review
  lanes, resolves gated findings one at a time, and applies approved fixes when edits are permitted.
disable-model-invocation: true
argument-hint: "[base|pr|mr]"
---

# Review Branch

Review a full branch or PR/MR before merge. This workflow owns scope, base resolution,
decision-first triage, edit policy, and completion. Apply `engineering-workflows:reviewing-code` for
lane selection, reviewer isolation, and finding contracts.

## Outcome

Produce a triaged pre-merge review before the branch merges.

## Scope And Base

Review the current branch against a base unless the user provides a PR, MR, branch, path, or
explicit range.

Resolve the base in this order:

1. user-specified base;
2. PR or MR target branch from the relevant CLI when available;
3. repository default from `origin/HEAD`, then `main`, `master`, or `trunk`;
4. another upstream only when it is explicitly known to be the merge target.

Use the merge-base diff for branch review. A feature branch's tracking branch is usually not its
merge target. Include relevant uncommitted changes only when present and call them out explicitly.

## Required And Conditional Lanes

Always require:

- `code review`
- `simplification`

Use the Lane Selection section of `engineering-workflows:reviewing-code` for conditional-lane
triggers. Resolve every borderline trigger toward selecting the lane, because a branch is the
pre-merge integration boundary.

Do not add lanes merely to increase reviewer count. Each selected lane needs a distinct question
that the required lanes would otherwise overload.

## Review Execution

Use the coordinator role from `engineering-workflows:reviewing-code`. For large or high-risk
branches, independently run all selected lanes when capacity allows.

## Decision First, Edits Second

Apply `engineering-workflows:receiving-feedback` to every finding:

1. collect all lane results;
2. mark obvious low-risk findings as auto-accepted without editing yet;
3. apply approved fixes in dependency order after the queue is resolved;
4. validate high-risk fixes independently and low-risk fixes in coherent batches.

Fix immediately only when an issue blocks understanding later findings, the user asks to handle it
now, a decision changes review scope, or an isolated risky fix needs evidence before triage can
continue.

Do not dump gated findings into a bulk approval list, even when the user asks to approve everything
at once.

## Output

End with scope and base, selected lanes and reviewers, finding counts by disposition, fixes applied,
validation results, and findings left for user or follow-up decisions.
