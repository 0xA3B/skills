---
name: review-feedback
description: >-
  Handle existing review feedback, reviewer comments, sub-agent findings, Claude findings, PR
  comments, or review-like artifacts by verifying and triaging them before responding or applying
  fixes. Do not use for first-party bug reports, implementation requests, or requests to generate a
  new code review.
---

# Review Feedback

Triage feedback from reviewers before acting. Feedback is evidence to evaluate, not an order to
follow. This skill supplies the feedback-handling discipline; the invoking workflow or user decides
whether accepted findings may be edited immediately.

## Trigger Boundary

Use this skill when there is existing feedback to handle, such as review comments, sub-agent
findings, Claude findings, PR comments, CI review summaries, or user-provided reviewer suggestions.

Do not use this skill for:

- first-party bug reports such as "this crashes" or "fix this failing test";
- requests to review code that have not produced findings yet;
- ordinary user corrections during design discussion;
- implementation requests with no review artifact.

## Status Taxonomy

Classify each feedback item before acting:

- `accepted`: valid, in scope, and should be fixed.
- `auto-accepted`: valid, low-risk, and the invoking workflow permits fixing without user review.
- `needs-clarification`: plausible but unclear; ask the reviewer or user before deciding.
- `gated`: valid or plausible, but needs a user decision before fixing.
- `deferred`: valid but outside current scope or not worth fixing now.
- `rejected`: invalid, duplicate, already addressed, or based on wrong context.

## Triage Rules

- Verify feedback against repository reality before accepting it.
- Ask follow-up questions when a finding is unclear or missing critical context.
- Push back with technical evidence when feedback is wrong, under-evidenced, or conflicts with
  established project decisions.
- If feedback conflicts with user direction or durable project guidance, stop and ask the user.
- Clarify unclear multi-item feedback before implementing any item that may depend on the unclear
  part.
- Fix one coherent item or small batch at a time when edits are permitted, then validate with the
  smallest relevant command.

## User Decisions

When feedback needs human input, present one decision at a time in natural language. Include:

- the finding;
- evidence and impact;
- your recommended approach;
- the exact decision needed.

Do not present a wall of unresolved findings unless the user asks for a summary. Avoid long code
snippets by default; provide pseudocode or code only when it materially clarifies the decision or
the user asks.

## Output

Report concise status by item or group:

- accepted or auto-accepted fixes and validation;
- gated decisions and outcomes;
- clarification asked or received;
- deferred and rejected findings with short rationale;
- remaining decisions, if any.
