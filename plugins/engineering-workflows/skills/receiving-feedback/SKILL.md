---
name: receiving-feedback
description: >-
  Use when handling existing feedback that evaluates completed work: reviewer comments, PR or MR
  comments, sub-agent findings, findings from a review agent or bot, or a user's correction of a
  prior response. Verifies and triages each item before responding or applying fixes. Do not use for
  a message that extends the active task rather than evaluating completed work, such as accepting a
  recommendation, adding a requirement, or supplying implementation details; for first-party bug
  reports; for implementation requests; or for requests to generate a new code review.
user-invocable: false
---

# Receiving feedback

Triage feedback from reviewers before acting. Feedback is evidence to evaluate, not an order to
follow. This skill supplies the feedback-handling discipline; the invoking workflow or user decides
whether accepted findings may be edited immediately.

## Status taxonomy

Classify each feedback item before acting:

- `accepted`: valid, in scope, and the remedy is obvious; fix it when the invoking workflow permits
  edits, otherwise report it for approval.
- `auto-accepted`: valid, low-risk, and the invoking workflow permits fixing without user review.
- `needs-clarification`: plausible but unclear; ask the reviewer or user before deciding.
- `gated`: valid or plausible, but the remedy needs a user decision. Gate a fix that changes
  intended behavior, a public interface, a data model, a migration, a dependency, security policy,
  broad architecture, or prior user direction, that falls outside the requested scope, or whose
  remedy adds new behavior (see the evaluation sequence).
- `deferred`: valid but outside current scope or not worth fixing now.
- `rejected`: invalid, duplicate, already addressed, or based on wrong context.

## Evaluate each item

Classify an item `accepted` only when all three steps hold:

1. Confirm the reported behavior or mechanism exists in the repository or runtime.
2. Identify the authoritative contract, requirement, or prior decision that makes the behavior
   incorrect. A real observation is not a defect when the assumed contract is wrong. When the
   governing contract is unknown, classify the item `needs-clarification`.
3. Judge the proposed remedy on its own. Accepting a defect is not accepting the reviewer's fix;
   choose the smallest change that is correct under that authority. A remedy that adds new behavior
   — a new concurrent path, subprocess, persisted field, or external call — is a change request
   whatever the reviewer labelled it: classify the item `gated`, and after explicit agreement it
   gets what a change of that size normally gets, its own tests and its own review pass, instead of
   being absorbed into the current fix budget. The tell is the remedy, not the severity: "this can
   deadlock" is a fix; "add a reader thread so it cannot deadlock" is a change.

## Triage rules

- Merge items from independent sources — separate review lanes, a PR bot, CI, the user — that
  converge on one mechanism or remedy, and record every corroborating source on the merged item so
  the corroboration survives into the report. Independent convergence is strong validity evidence,
  not duplication; treat as duplicate only repeats from the same source.
- Push back with technical evidence when feedback is wrong, under-evidenced, or conflicts with
  established project decisions.
- If feedback conflicts with user direction or durable project guidance, stop and ask the user.
- Clarify unclear multi-item feedback before implementing any item that may depend on the unclear
  part.
- When edits are permitted, fix one coherent item or small batch at a time, then validate with the
  smallest relevant command.

## Decision capture

A finding rejected or deferred because of context only the authoring session holds is evidence that
the code does not carry that context: the reviewer is a reader without the session, so every future
reader will re-derive the same objection — or "fix" the deliberate choice and silently undo it.
Capture the context while the author still holds it:

- When a rejection rests on a deliberate decision, accepted tradeoff, or intentional limitation the
  code does not show, record the why in the strongest surface the next actor will hit: a code
  comment for a local constraint, a test asserting the deliberate behavior by name for behavioral
  intent, or durable project instructions for a project-wide convention.
- Give a valid deferred finding a TODO comment that names its trigger condition — what would make
  the deferred work due — not just the gap.
- State the constraint, not the review history: "X is intentionally unsupported because Y", never
  "reviewer suggested X and we declined".
- Capture nothing for findings the code already refutes or findings rejected as low-severity or
  low-value; annotating every wrong or minor finding is comment bloat.
- A capture is an edit under the same authority as fixes: write it directly only when the invoking
  workflow permits the edit, and otherwise propose it for approval alongside the finding's
  disposition.

## User decisions

When feedback needs human input, present one decision at a time in natural language, unless the user
asks for a summary of everything. Include:

- the finding;
- evidence and impact;
- your recommended approach;
- the exact decision needed.

Avoid long code snippets by default; provide pseudocode or code only when it materially clarifies
the decision or the user asks.

## Output

Report concise status by item or group:

- accepted or auto-accepted fixes and validation;
- gated decisions and outcomes;
- clarification asked or received;
- deferred and rejected findings with short rationale;
- remaining decisions, if any.
