---
name: grill-me
description: >-
  Interview the user through an adversarial decision tree until the important decisions,
  dependencies, and edge cases are clear. Use when the user asks to stress-test a plan, decision,
  idea, or design, get grilled on an approach, challenge a brainstormed direction, or resolve
  ambiguity before implementation.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/productivity/grilling
  upstream_reviewed: 84fdeffd12f2ee307994d1eb6feb48173b6e0502
disable-model-invocation: true
argument-hint: "[approach]"
---

# Grill me

Interview the user relentlessly until there is shared understanding of the work. Map the work as a
decision tree — every decision branches into the decisions that hang off it — and walk it in rounds
of questions.

## Outcome

Expose and resolve decisions that materially affect behavior, implementation, risk, scope, or
validation. Finish with an approach the user has explicitly confirmed is specific enough to
implement, defer, or reject.

## Facts and decisions

- Find facts by inspecting the environment: repository files, history, tools, configured services,
  and current external sources when relevant. When the harness provides subagents, delegate lookups
  to them so questioning continues while they run.
- Do not ask the user to supply facts that can be established safely from available evidence.
- Decisions belong to the user. Present each material choice, your recommendation, and the tradeoff
  it resolves, then wait for the user's answer.
- Keep assumptions distinct from facts and decisions. Make unresolved uncertainty explicit.

## Interview rounds

The **frontier** is every decision whose prerequisites are already settled — the questions you can
ask now without guessing at answers you have not heard yet. Work the tree in rounds:

1. Ask the whole frontier as one numbered round, ordered by how much each question reduces
   implementation risk or decision ambiguity. If a question depends on another question still open
   in this round, hold it for a later round.
2. Wait for the user's answers. Do not compute the next round until each answer is understood,
   disagreement is explicit, and uncertainty is captured as an assumption, decision, or follow-up.
3. Settled decisions push the frontier outward and unblock the questions that depended on them.
   Recompute the frontier and ask the next round.
4. Treat a running lookup as an unsettled prerequisite: hold only the questions downstream of the
   missing fact and ask the rest of the frontier now.

Format each prose question like so:

```
❓ **Q1 — <question title>**: <question body, with options or scenarios when they help>

➡️ <your recommended answer and the tradeoff it resolves>
```

When the harness provides a structured question tool, route a question through it only when the
answer maps cleanly onto a few discrete options and selecting one would fully answer it. Keep a
question in prose when it is open-ended or the useful answer is itself prose. A round may mix both:
send the option-shaped questions through the tool and the rest as prose.

## Interview behavior

- Challenge vague, overloaded, or conflicting terms. Propose a canonical term, a tight definition,
  and aliases to avoid.
- Test domain relationships, state transitions, and ownership with concrete edge-case scenarios.
- Verify important claims about current behavior against code. When code and the user's model
  disagree, pause and resolve which should be authoritative.
- Use `AGENTS.md ## Terminology` when present. Update stable domain terms there as they crystallize;
  skip generic programming terms and incidental implementation names.
- Keep the session to questions and evidence gathering; implement, prototype, create tickets, or
  enact the approach only after the user confirms completion.

When an unresolved question needs executable evidence, stop that branch and recommend an explicit
invocation of `engineering-workflows:prototype`. When terminology is the main unresolved work,
recommend `engineering-workflows:terminology`.

## Completion

The interview is complete when the frontier is empty: every branch of the decision tree visited,
nothing left silently assumed. Before declaring completion:

1. Summarize the decisions, facts, assumptions, rejected paths, and remaining follow-ups.
2. State why the approach is ready to implement, defer, or reject.
3. Report terminology changes, unresolved questions that need executable evidence, and the
   recommended next explicit workflow. If another manual engineering skill is next, include a
   handoff note with the context to carry forward and its exact `engineering-workflows:<skill>`
   invocation.
4. Ask the user to confirm that shared understanding has been reached.
