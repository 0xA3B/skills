---
name: decision-records
description: >-
  Maintain a repository's architecture decision records (ADRs). Use when the user asks to record,
  write, update, or supersede an ADR, a design decision, or the reason an alternative was rejected,
  when a workflow has settled a hard-to-reverse choice, when the user asks to check the records that
  touch an area before a change, or when another skill directs applying
  engineering:decision-records. Do not use for domain terms or glossary entries
  (engineering:terminology), for deferred candidates, open questions, specs, or tickets, or for
  conceptual questions about ADRs.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/domain-modeling
  upstream_reviewed: c55ee46073ed923f86ce59a5eb3b6d895095d1b7
argument-hint: "[decision]"
---

# Decision records

A decision record captures one choice a future reader cannot recover from the code: what was
decided, in what context, and why. Records travel with the repository, land in the same change as
the code they explain, and stay readable without access to an issue tracker.

## Gates

Write a record only when all three hold:

1. **Hard to reverse.** Changing the choice later costs real migration, rewrite, or renegotiation.
2. **Surprising without context.** A reader of the code would ask why it was done this way.
3. **A real trade-off.** Genuine alternatives existed and one was chosen for specific reasons.

A choice that fails any gate gets no record: an easy reversal will be reversed, an obvious choice
raises no question, and a choice without alternatives has no reason to explain. A surprise whose
reason fits in a comment at the site, and that fails either other gate, gets the comment and no
record. Choices that pass include an architectural shape, an integration pattern between contexts, a
technology with lock-in, a boundary or ownership rule, a deliberate deviation from the obvious path,
a constraint invisible in the code, and a rejected alternative whose rejection is not obvious.

Deferred candidates, open questions, specs, and tickets are pending work, not decisions; leave them
where the invoking workflow already puts pending work.

## Location

- If the repository has an ADR directory, such as `docs/adr/` or a directory its instructions name,
  use it.
- Otherwise create `docs/adr/` when the first record is written.
- Name each file `NNNN-slug.md`. Take the highest existing number plus one.

## Format

A record is a title and one to three sentences covering context, decision, and reason. Add `status`
frontmatter only when the record is revisited, using `proposed`, `accepted`, `deprecated`, or
`superseded by ADR-NNNN`. Add a **Considered options** section only when the rejected alternatives
are worth remembering, and a **Consequences** section only when a downstream effect is not obvious.
Apply `writing:technical-writing` to the body when that skill is available.

```md
# Ordering and Billing communicate through domain events

Billing needs order state but must keep working while Ordering deploys. Ordering publishes domain
events and Billing projects them, instead of Billing calling Ordering over HTTP, so a deploy in one
context never blocks the other. Billing's view of an order can lag by the event delivery delay.
```

## Point from the code

If the decision surfaces at a code location, put one sentence of why and the record's path in a
comment at each site where a reader first meets it. The comment carries no more than the record's
decision sentence.

## Read before proposing

Before proposing a change to an area, list the ADR directory and read every record whose title names
a module, boundary, or technology in scope, and every record whose title names none, because a rule
without a named scope may apply anywhere. If the directory is absent, continue without comment.

If the proposal contradicts a record, either drop the proposal or present it with the record cited
and the friction that justifies reopening it. If the user reopens the decision, write a new record
that states the new decision, and set the old record's `status` to `superseded by ADR-NNNN`.

## Terminology

If a decision introduces or renames a durable domain term, apply `engineering:terminology` for the
term. The record names the term; the terminology entry cites the record.

## Completion

Stop when the record is written in the ADR directory and passes every gate, or when the proposal has
been checked against every record that Read before proposing selects, and each contradiction is
cited. Report each record written or superseded by path.
