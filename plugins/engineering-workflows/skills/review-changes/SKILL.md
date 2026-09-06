---
name: review-changes
description: >-
  Use when asked to review changes made in the current session before committing, opening a PR, or
  merging: the worktree, staged or work-in-progress edits, or the session's commits up to a whole
  branch, including changes to agent-instruction files and documentation. Also use when asked to run
  one review lane, such as test quality or prose, over those changes. Runs focused review lanes with
  independent reviewers, verifies and triages the findings, applies accepted in-scope fixes, reruns
  the lanes those fixes invalidated, and validates. Do not use for a branch, PR, or MR someone else
  authored; for existing reviewer feedback; for first-party bug reports; for implementation
  requests; for architecture or test-suite audits of a whole codebase; for writing documentation; or
  for conceptual questions about review.
license: MIT
metadata:
  original_author: Alex Baker
argument-hint: "[path|lane]"
---

# Review changes

Review changes this session authored through focused lanes run by independent reviewers, then
triage, fix, and validate. This workflow owns scope, depth, lane selection, fix policy, and
completion.

## Outcome

Find and fix valid, in-scope issues in the session's changes, and leave review evidence current for
the settled revision.

## Scope

Default to staged, unstaged, and untracked non-ignored files in the current worktree, plus any
commits this session created as part of the current effort. Diff session commits from their merge
base with the target branch, or from where this session's work began when that is narrower. If the
user names a path, a lane, or a narrower target, review only that target.

If the session authored nothing, say so and ask for a specific commit range. If the target is work
this session did not author, such as another person's branch, PR, or MR, stop and say so: the
autonomous triage below relies on the authoring context.

## Review depth

For a small, low-risk diff such as wording, comments, metadata text, or narrow configuration, do a
lightweight main-thread review: inspect the exact diff, check obvious behavior and policy risks, run
the smallest relevant validation, and report concisely.

Use the full lane workflow when the change is behavior-affecting, non-trivial, cross-cutting,
security-sensitive, release-affecting, or explicitly requested as a full review.

## Lane selection

Choose lanes by the primary question and remedy, and read a lane reference only when its lane is
selected:

- [CODE-REVIEW.md](references/CODE-REVIEW.md): behavior could be wrong, unsafe, unreliable, or
  incompatible, and the remedy is a corrected result.
- [SIMPLIFICATION.md](references/SIMPLIFICATION.md): the remedy is a smaller local expression with
  unchanged architecture and public behavior.
- [CODEBASE-DESIGN.md](references/CODEBASE-DESIGN.md): the remedy moves responsibility, changes
  module depth, relocates a seam, or restores repository-convention fit.
- [API-SEAM.md](references/API-SEAM.md): the remedy changes what callers must know about a new or
  materially changed caller-facing interface.
- [TEST-REVIEW.md](references/TEST-REVIEW.md): the remedy improves how meaningful test changes or
  high-risk behavior are proved.
- [SPEC-ADHERENCE.md](references/SPEC-ADHERENCE.md): the remedy reconciles the implementation with
  an available spec, issue, PRD, acceptance criteria, or equivalent intended-behavior source.
- [PROSE-REVIEW.md](references/PROSE-REVIEW.md): the remedy improves how changed agent-instruction
  files or human-facing documentation read against their writing standard.

Two lanes are content-owning: `code review` owns changed code, configuration, schemas, and other
behavior-affecting surface; `prose review` owns meaningfully changed agent-instruction files and
human-facing documentation. A full review requires each content-owning lane whose content the diff
changes and no content-owning lane for content the diff does not touch, so a prose-only diff runs
without the `code review` lane.

Three lanes carry extra selection conditions:

- Select simplification only when the user or invoking workflow names size, duplication, or
  expression bloat as a concern for the target; it is not a default lane.
- Select spec adherence only when the user or invoking workflow supplies an intent source that is
  independent of the implementation's author and effort; a spec written by the same author in the
  same effort mostly re-checks the author's consistency with themselves.
- Select prose review only when the diff meaningfully changes prose — new or rewritten sections, not
  mechanical or incidental wording edits — and only when the `writing` plugin's skills are
  available. When the diff warrants the lane but the writing skills are absent, skip the lane and
  state in the final report that prose review was skipped because the `writing` plugin is not
  installed.

Resolve a borderline conditional trigger by the review moment: toward skipping the lane for an
incremental pre-commit check, toward selecting it when this review gates a PR or merge. Do not add
lanes to increase reviewer count; each selected lane needs a distinct question that the required
lanes would otherwise overload.

When a finding crosses lanes, keep it in the lane that owns the primary remedy and add cross-lane
context in the evidence.

## Reviewers

Run one independent reviewer per selected lane when subagents are available, so one review intent
does not anchor another. The prose lane may run one reviewer per writing standard when the diff
spans both agent-instruction files and human-facing documentation. Keep independent reviewers even
when the user asks to save time or to have the main agent handle every lane; when subagents are
unavailable, run the strongest local review possible and report that the lanes were not independent.

Provide every lane reviewer:

- the exact review target and diff command;
- relevant repository guidance and intent sources;
- the assigned lane reference, plus [FOWLER-SMELLS.md](references/FOWLER-SMELLS.md) for the
  simplification and codebase-design lanes;
- the `engineering-workflows:codebase-design` skill body for the codebase-design and API/seam lanes,
  because some agents do not let an isolated reviewer load another skill;
- the `writing:agent-instructions` or `writing:technical-writing` skill body matching each reviewed
  file type for the prose-review lane, plus the agent-instructions review checklist reference when
  instruction files are in scope, for the same reason;
- the `writing:prose` skill body alongside the technical-writing body, because the technical-writing
  standard applies the prose slop patterns and an isolated reviewer cannot load them;
- [review-finding.schema.json](references/review-finding.schema.json) when structured output is
  available;
- a prohibition on adding lanes, expanding scope, triaging user decisions, or applying fixes.

The assigned lane reference is the reviewer's complete lane instruction. Keep the brief to
run-specific content: target, diff command, scope, intent sources, repository guidance, and
prohibitions. When a lane needs sharper review instructions, edit its lane reference so every future
run inherits the change, instead of adding lane instructions to one run's brief.

## Finding contract

Each lane returns the object defined by
[review-finding.schema.json](references/review-finding.schema.json): `lane`, `verdict`, `summary`,
`findings`, and `verified_sound`. Form each finding ID as the lane prefix — `CR`, `SIM`, `CBD`,
`API`, `TEST`, `SPEC`, or `PROSE` — a hyphen, and a number, as in `TEST-1`. When structured output
is unavailable, report the same fields in prose.

Ground findings in executed evidence: when a cheap check can demonstrate the failure — a mutation, a
targeted test run, a command — run it and put the output, with counts and names, in `evidence`.
Reserve reasoning-only evidence for findings no cheap check can demonstrate. Anchor each finding on
its enclosing symbol name in `symbol`; line numbers go stale as the target changes and are
secondary.

List in `verified_sound` the checks the lane ran or considered and declined to report. The
enumerated checks bound the finding set and make an empty findings list informative.

Keep a finding whose failure state is realistic but unproven — a race, a rare error path, a boundary
the code does not exclude — at reduced confidence instead of dropping it. Drop a finding only when
the code refutes it: cite the line, invariant, or guard that makes the failure impossible.

Report no findings when the lane passes. Do not invent low-value style comments to justify a lane.

## Triage and fixes

Apply `engineering-workflows:receiving-feedback` to the returned findings: merge findings that
converge across lanes by its triage rules, verify before accepting, and classify each with its
status taxonomy.

The session's authoring context is triage context: judge findings against the decisions and
constraints from the development session, and triage autonomously instead of replaying findings to
the user. Report every rejection with its rationale; autonomy covers judging findings, not
discarding them silently.

Automatically apply accepted or auto-accepted behavior-preserving fixes within the changed surface
or directly adjacent tests and docs. Apply dependent fixes in dependency order and let the affected
surface settle before re-reviewing. Ask about one gated finding at a time; gate by the
`receiving-feedback` taxonomy, not by finding size alone. Defer unrelated cleanup rather than
expanding the worktree.

## Rerun invalidated lanes

Lane results describe one revision. After accepted fixes settle, identify each selected lane whose
reviewed assumptions the fixes materially changed:

- a changed public interface or ownership boundary invalidates API-seam review and can invalidate
  code review;
- a changed state transition, ordering rule, or external protocol invalidates code review and can
  invalidate test review and spec adherence;
- new or restructured tests invalidate test review;
- a changed reading of a requirement invalidates spec adherence and every lane that relied on it;
- materially rewritten prose invalidates prose review.

Rerun only those lanes against the settled diff, with fresh reviewers, and triage their findings as
new feedback through the same gate. Repeat until a rerun applies no material fix. A typo fix,
mechanical rename, formatting change, or test-expectation update that leaves a lane's assumptions
intact invalidates nothing. State which lanes reran and why.

## Validation and output

Run the smallest relevant fresh validation for applied fixes. Add or update behavior-focused tests
when a fix changes behavior and a stable test seam exists.

End with scope, lanes and reviewers, fixes applied, lanes rerun and why, deferred or rejected
findings with rationale, validation commands and results, and remaining decisions.
