---
name: reviewing-code
description: >-
  Shared review discipline for reviewing your own work through focused lanes. Use when coordinating
  review lanes over changes this session or its user produced — a worktree, branch, PR, MR, or diff,
  including changes to agent-instruction files such as AGENTS.md, CLAUDE.md, or SKILL.md and to
  documentation such as READMEs — or when performing an assigned review lane such as test quality,
  simplification, codebase design, API seams, spec adherence, or prose quality. Do not use for
  generic requests to review arbitrary or third-party code, existing reviewer feedback, first-party
  bug reports, implementation requests, architecture-only audits, writing or editing documentation,
  or conceptual review questions.
license: MIT
metadata:
  original_author: Alex Baker
user-invocable: false
---

# Reviewing code

Separate review intent into focused lanes while the invoking workflow owns scope, edit policy, and
required minimums.

## Role

Determine the current role before reading lane references.

- **Coordinator**: choose lanes, dispatch reviewers, normalize findings, deduplicate, and return the
  merged result to the invoking workflow.
- **Lane reviewer**: run only the assigned lane over the supplied target. Do not add lanes, expand
  scope, spawn reviewers, triage user decisions, or apply fixes.

`review-changes`, `review-branch`, or the user supplies the scope and minimum lanes.

When no invoking workflow supplied scope and edit policy, run findings-only: select the minimum
lanes the target justifies, report normalized findings without applying fixes, and recommend an
explicit `engineering-workflows:review-changes` or `engineering-workflows:review-branch` invocation
for triage, fixes, and validation.

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

- Select simplification only when the invoking workflow or the user names size, duplication, or
  expression bloat as a concern for the target; it is not a default lane.
- Select spec adherence only when the intent source is independent of the implementation's author
  and effort; a spec written by the same author in the same effort mostly re-checks the author's
  consistency with themselves.
- Select prose review only when the diff meaningfully changes prose — new or rewritten sections, not
  mechanical or incidental wording edits — and only when the `writing` plugin's skills are
  available. When the diff warrants the lane but the writing skills are absent, skip the lane and
  state in the final report that prose review was skipped because the `writing` plugin is not
  installed.

When a finding crosses lanes, keep it in the lane that owns the primary remedy and add cross-lane
context in the evidence. The coordinator deduplicates findings that share a mechanism or fix.

## Subagent policy

Use one reviewer per selected lane when the invoking workflow calls for a full review and subagents
are permitted. Keep lane contexts independent so one review intent does not anchor another.

If the coordinating session authored the change, assign every required lane to an independent
reviewer when reviewers are available. If subagents are unavailable or not permitted, run the
strongest local review possible and report that the lanes were not independent. Keep independent
reviewers even when the user asks to save time or to have the main agent handle every lane; state
the limitation instead of waiving it.

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
- a prohibition on expanding scope or applying fixes.

The assigned lane reference is the reviewer's complete lane instruction. Keep the coordinator brief
to run-specific content — target, diff command, scope, intent sources, repository guidance, and
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
Stop when every selected lane has returned, results are normalized, and duplicates are merged
without erasing their distinct evidence sources.
