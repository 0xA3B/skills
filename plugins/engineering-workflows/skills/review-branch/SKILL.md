---
name: review-branch
description: >-
  Review a branch, WIP branch, PR, MR, or branch-vs-base diff before merge. Use when the user asks
  for branch review, pre-merge review, PR review, MR review, or review against a base branch. Runs
  review lanes, triages findings decision-first, and applies approved fixes after triage when
  appropriate.
disable-model-invocation: true
---

# Review Branch

Review a full branch or PR/MR before merge. Scope is the skill boundary; intent is handled through
review lanes.

## Outcome

Produce a triaged pre-merge review of the branch diff, resolve gated decisions one finding at a
time, then apply approved fixes when edits are permitted. Finish with validation evidence and a
concise status summary.

## Scope

Review the current branch against a base branch unless the user provides a PR, MR, branch, path, or
explicit range.

Base resolution:

1. Use the user-specified base when provided.
2. For PR or MR review, resolve the target branch when the relevant CLI and authentication are
   available.
3. Otherwise use the repository default branch, preferring `origin/HEAD`, then common names such as
   `main`, `master`, or `trunk`.
4. Use an upstream branch only when it is explicitly known to be the intended review base. A feature
   branch's remote tracking branch is usually not the merge target and can produce an empty or
   partial pre-merge diff.

Treat the full branch diff as scope. Include uncommitted changes only when they are present and
relevant; call out that they are included.

## Review Lanes

Read `../../references/review-lanes.md` before launching reviewers. Run the required
`simplification` and `code review` lanes over the branch target, and add extra lanes when branch
size or risk justifies them.

If the user provides a spec, PRD, issue, acceptance criteria, design doc, or similar source of
intended behavior, add a separate `spec adherence` lane. Keep it separate from the general
`code review` lane so implementation bugs, missing requirements, contradictory behavior, and scope
creep are triaged without blurring the evidence source. Require the lane to cite the spec source for
each finding.

## Sub-Agent Policy

If this chat session wrote or substantially edited the code under review, the main agent must not
own a required review lane. Spawn one sub-agent per required lane and keep the main agent as
coordinator and triager.

If this is a fresh session or the main agent did not author the branch changes, the main agent may
own one lane and spawn at least one sub-agent for the other lane. For large, cross-cutting,
security-sensitive, migration-heavy, or high-risk branches, keep the main agent as coordinator and
spawn all required lanes plus any extra lanes that risk justifies.

## Optional Claude Review

Do not include Claude by default. If the user explicitly asks for Claude or Claude Code as part of
the branch review, use `claudex:adversarial-review` as the Claude reviewer adapter for Claude CLI
invocation, permissions, read-only constraints, schema use, session follow-ups, and trust boundary.

The review lanes still own the lane prompts and scope. Add matching Claude reviewers for the two
required lanes when explicitly requested. For optional extra lanes, add Claude reviewers only when
the lane is high-risk enough to justify the extra review. Treat each Claude process like another
lane reviewer and triage its findings with the same feedback discipline as Codex sub-agent findings.
Claude adapter output may use the `claudex` schema instead of the shared review-lane schema; the
coordinator normalizes Claude findings into the merged finding set before deduping or presenting
them.

## Decision-First, Edit-Second Triage

Use `engineering-workflows:review-feedback` discipline for all reviewer findings:

- verify before accepting;
- ask follow-up questions or push back when unclear or wrong;
- classify findings as accepted, auto-accepted, needs-clarification, gated, deferred, or rejected.

For branch review, triage before editing:

1. Run all lanes and collect findings.
2. Dedup findings that point at the same line, mechanism, or missing coverage.
3. Mark obvious low-risk, tightly scoped findings as `auto-accepted`, but do not edit yet.
4. Present gated findings to the user one at a time in natural language.
5. Record each decision before moving to the next gated finding.
6. After the decision queue is resolved, apply approved fixes in dependency order.
7. Validate high-risk fixes independently and low-risk fixes in small coherent batches.

Do not dump gated findings into a bulk approval list, even when the user asks to approve everything
at once. The one-finding-at-a-time loop exists to preserve decision quality; summaries are fine only
after individual decisions are resolved or when the user asks for a non-decision overview.

Exceptions: fix immediately if one issue blocks understanding later findings, if the user asks to
handle that finding now, if a decision changes review scope enough to require re-triage, or if a
risky fix needs isolated validation before continuing.

## Edit Boundary

Do not auto-accept or silently edit broad refactors, public API changes, data model changes,
migrations, dependency changes, security-policy changes, product behavior changes, or fixes outside
the branch review scope. Present those as gated or deferred.

## Output

End with:

- review scope and base;
- lanes run, including Codex and optional Claude reviewers;
- auto-accepted, accepted, gated, deferred, and rejected finding counts;
- fixes applied and validation results;
- findings left for user or follow-up decisions.
