---
name: reviewing-code
description: >-
  Shared review discipline for reviewing your own work through focused lanes. Use when coordinating
  review lanes over changes this session or its user produced — a worktree, branch, PR, MR, or diff
  — or when performing an assigned review lane such as test quality, simplification, codebase
  design, API seams, or spec adherence. Provides focused lanes, reviewer isolation, and structured
  findings. Do not use for generic requests to review arbitrary or third-party code, existing
  reviewer feedback, first-party bug reports, implementation requests, architecture-only audits, or
  conceptual review questions.
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
- [review-finding.schema.json](references/review-finding.schema.json) when structured output is
  available;
- a prohibition on expanding scope or applying fixes.

## Finding contract

Each lane returns the object defined by
[review-finding.schema.json](references/review-finding.schema.json): `lane`, `verdict`, `summary`,
and `findings`. Prefix each finding ID with its lane — `CR`, `SIM`, `CBD`, `API`, `TEST`, or `SPEC`
— followed by a number. When structured output is unavailable, report the same fields in prose.

Keep a finding whose failure state is realistic but unproven — a race, a rare error path, a boundary
the code does not exclude — at reduced confidence instead of dropping it. Drop a finding only when
the code refutes it: cite the line, invariant, or guard that makes the failure impossible.

Report no findings when the lane passes. Do not invent low-value style comments to justify a lane.
Stop when every selected lane has returned, results are normalized, and duplicates are merged
without erasing their distinct evidence sources.
