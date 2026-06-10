---
name: review-changes
description: >-
  Review current worktree, WIP, or narrow pre-commit changes after a coding session. Use when the
  user asks to review current changes, worktree changes, staged changes, work-in-progress changes,
  or review before committing. Runs simplification and code-review lanes, triages findings, and
  applies accepted in-scope fixes. Do not use for conceptual questions about review criteria.
---

# Review Changes

Review the current worktree before commit. Scope is the skill boundary; intent is handled through
review lanes.

## Outcome

Find and fix valid, in-scope issues in current worktree changes. Finish with accepted fixes, skipped
or deferred findings, and fresh validation evidence.

## Scope

Default to current worktree changes: staged, unstaged, and untracked non-ignored files. If the user
provides a path or narrow target, review only that target. If there are no worktree changes, say so
and ask whether to review a commit or branch range instead; do not silently become a branch review.
Do not use this workflow for conceptual questions about what review should check.

## Review Lanes

Read `../../references/review-lanes.md` before launching reviewers. Run the required
`simplification` and `code review` lanes over the current worktree target, and add extra lanes only
when the changed surface would otherwise overload the required lanes.

If the user explicitly asks to review the worktree against a provided spec, issue, acceptance
criteria, or similar source of intended behavior, add a lightweight `spec adherence` lane instead of
folding that review into the general `code review` lane.

## Sub-Agent Policy

If this chat session wrote or substantially edited the code under review, the main agent must not
own a required review lane. Spawn one sub-agent per required lane and keep the main agent as
coordinator, triager, fixer, and validator.

Do not waive this authorship-bias rule because the review seems small, the user wants to save time,
or the user asks the main agent to personally handle every lane. In that situation, state the
constraint and use sub-agents when review can proceed. If sub-agents are unavailable, stop and
report that the required independent-lane review cannot be completed in this session.

If this is a fresh session or the main agent did not author the reviewed changes, the main agent may
own one lane and spawn at least one sub-agent for the other lane. For large, cross-cutting,
security-sensitive, migration-heavy, or high-risk changes, keep the main agent as coordinator and
spawn all required lanes plus any extra lanes that risk justifies.

## Optional Claude Review

Do not include Claude by default. If the user explicitly asks for Claude or Claude Code as part of
the worktree review, use `claudex:adversarial-review` as the Claude reviewer adapter for Claude CLI
invocation, permissions, read-only constraints, schema use, session follow-ups, and trust boundary.

For `review-changes`, default to one Claude review pass over the current worktree target. Use
lane-specific Claude reviewers only when the user asks for them or the changed surface is risky
enough to justify the extra review. Treat Claude findings like external reviewer feedback and
normalize them into the same triage flow as sub-agent findings before accepting or fixing them.

## Feedback Triage And Fixes

Use `engineering-workflows:review-feedback` discipline for all reviewer findings:

- verify before accepting;
- ask follow-up questions or push back when unclear or wrong;
- classify findings as accepted, auto-accepted, needs-clarification, gated, deferred, or rejected.

For this worktree review, automatically apply accepted or auto-accepted behavior-preserving fixes
when they are in scope. Fixes should touch the changed surface or directly adjacent tests/docs
needed to validate the change.

Ask the user one finding at a time when a finding is high-risk, unclear, changes intended behavior,
requires broad refactoring, changes public API or data models, adds dependencies, changes security
policy, or conflicts with prior user direction.

## Validation

Run the smallest relevant validation for the fixes you applied. If a fix changes behavior, add or
update behavior-focused tests when practical. Do not claim validation from expectation or stale
output.

## Output

End with:

- review scope;
- lanes run and whether sub-agents were used;
- accepted fixes applied;
- skipped, deferred, rejected, or still-gated findings with short rationale;
- validation command and result;
- remaining decisions, if any.
