---
name: receiving-feedback
description: >-
  Handle existing review feedback, reviewer comments, sub-agent findings, Claude findings, PR
  comments, or review-like artifacts by verifying and triaging them before responding or applying
  fixes. Do not use for first-party bug reports, implementation requests, or requests to generate a
  new code review.
user-invocable: false
---

# Receiving Feedback

Triage feedback from reviewers before acting. Feedback is evidence to evaluate, not an order to
follow. This skill supplies the feedback-handling discipline; the invoking workflow or user decides
whether accepted findings may be edited immediately.

## Status Taxonomy

Classify each feedback item before acting:

- `accepted`: valid, in scope, and the remedy is obvious; fix it when the invoking workflow permits
  edits, otherwise report it for approval.
- `auto-accepted`: valid, low-risk, and the invoking workflow permits fixing without user review.
- `needs-clarification`: plausible but unclear; ask the reviewer or user before deciding.
- `gated`: valid or plausible, but the remedy needs a user decision. Gate a fix that changes
  intended behavior, a public interface, a data model, a migration, a dependency, security policy,
  broad architecture, or prior user direction, or that falls outside the requested scope.
- `deferred`: valid but outside current scope or not worth fixing now.
- `rejected`: invalid, duplicate, already addressed, or based on wrong context.

## Triage Rules

- Verify feedback against repository reality before accepting it.
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

## User Decisions

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
