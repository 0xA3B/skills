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

# Reviewing Code

Separate review intent into focused lanes while the invoking workflow owns scope, edit policy, and
required minimums.

## Role

Determine the current role before reading lane references.

- **Coordinator**: choose lanes, dispatch reviewers, normalize findings, deduplicate, and return the
  merged result to the invoking workflow.
- **Lane reviewer**: run only the assigned lane over the supplied target. Do not add lanes, expand
  scope, spawn reviewers, triage user decisions, or apply fixes.

This skill requires no lane by itself. `review-changes`, `review-branch`, or the user supplies the
scope and minimum lanes.

When no invoking workflow supplied scope and edit policy, run findings-only: select the minimum
lanes the target justifies, report normalized findings without applying fixes, and recommend an
explicit `engineering-workflows:review-changes` or `engineering-workflows:review-branch` invocation
for triage, fixes, and validation.

## Lane Selection

Use these references only when the lane is selected:

- [CODE-REVIEW.md](references/CODE-REVIEW.md): behavior could be wrong, unsafe, unreliable, or
  incompatible.
- [SIMPLIFICATION.md](references/SIMPLIFICATION.md): local behavior-preserving reduction.
- [CODEBASE-DESIGN.md](references/CODEBASE-DESIGN.md): module depth, seam placement, architecture,
  or repository-convention fit.
- [API-SEAM.md](references/API-SEAM.md): new or materially changed caller-facing interfaces.
- [TEST-REVIEW.md](references/TEST-REVIEW.md): meaningful test changes, high-risk behavior, or a
  substantial test strategy.
- [SPEC-ADHERENCE.md](references/SPEC-ADHERENCE.md): a spec, issue, PRD, acceptance criteria, or
  equivalent intended-behavior source is available.

For Fowler smells, read [FOWLER-SMELLS.md](references/FOWLER-SMELLS.md) from the simplification or
codebase-design lane instead of duplicating the catalog.

Choose lanes by the primary question and remedy:

- A wrong result or unsafe behavior belongs to code review.
- A smaller local expression with unchanged architecture and public behavior belongs to
  simplification.
- Moving responsibility, changing module depth, or relocating a seam belongs to codebase design.
- Changing what callers must know belongs to API/seam review.
- Improving how behavior is proved belongs to test review.
- Comparing implementation with an external intent source belongs to spec adherence.

When a finding crosses lanes, keep it in the lane that owns the primary remedy and add cross-lane
context in the evidence. The coordinator deduplicates findings that share a mechanism or fix.

## Subagent Policy

Use one reviewer per selected lane when the invoking workflow calls for a full review and subagents
are permitted. Keep lane contexts independent so one review intent does not anchor another.

If the coordinating session authored the change, it should not own a required lane when independent
reviewers are available. If subagents are unavailable or not permitted, run the strongest local
review possible and report that the lanes were not independent.

Provide every lane reviewer:

- the exact review target and diff command;
- relevant repository guidance and intent sources;
- the assigned lane reference;
- the `engineering-workflows:codebase-design` skill body for the codebase-design and API/seam lanes,
  because an isolated reviewer cannot load another skill on every agent;
- [review-finding.schema.json](references/review-finding.schema.json) when structured output is
  available;
- a prohibition on expanding scope or applying fixes.

Instruct each reviewer to report every finding that has a nameable failure scenario or concrete
cost; silently dropping half-believed findings bypasses coordinator triage and is the dominant cause
of missed defects.

## Finding Contract

Each lane returns `lane`, `verdict`, `summary`, and findings with a lane-distinct ID, severity,
file, optional lines, summary, evidence, impact, recommendation, confidence, and optional follow-up
question. Use prefixes such as `CR`, `SIM`, `CBD`, `API`, `TEST`, and `SPEC`.

Keep a finding whose failure state is realistic but unproven — a race, a rare error path, a boundary
the code does not exclude — at reduced confidence instead of dropping it. Drop a finding only when
the code refutes it: cite the line, invariant, or guard that makes the failure impossible.

Report no findings when the lane passes. Do not invent low-value style comments to justify a lane.
Stop when every selected lane has returned, results are normalized, and duplicates are merged
without erasing their distinct evidence sources.
