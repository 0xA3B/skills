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
  and current external sources when relevant. When the harness provides subagents, dispatch lookups
  to them so questioning continues while they run.
- When a question needs executable evidence, apply `engineering:prototype`; its subagent decision
  tree decides where the prototype runs. When that tree dispatches a subagent, treat the prototype
  as a running lookup. When the tree keeps the prototype in the main thread, no subagent capability
  exists, or the user wants to drive the prototype, recommend the explicit invocation and move the
  question and the decisions downstream of it off the frontier into the completion summary's
  unresolved list; they return to the frontier only when the evidence arrives.
- Do not ask the user to supply facts that can be established safely from available evidence.
- Decisions belong to the user. Present each material choice in the shape `## Question shapes`
  assigns, then wait for the user's answer.
- Keep assumptions distinct from facts and decisions. Make unresolved uncertainty explicit.

## Interview rounds

The **frontier** is every decision whose prerequisites are already settled — the questions you can
ask now without guessing at answers you have not heard yet. A **branch** is a top-level decision of
the tree together with every decision under it. Work the tree in rounds:

1. Open the round with the answers to the user's questions from the previous round and what those
   answers settled. Round 1 opens with the facts established so far.
2. Compose the round from the frontier, one section per branch. A branch whose root decision is open
   contributes exactly one question; a branch whose root is settled contributes every frontier
   question under it. A decision the user stated in the invocation or an earlier answer counts as
   settled when the facts gathered do not contradict it; when they do, the contradiction is that
   branch's one question. Order branches and questions by how much each reduces implementation risk
   or decision ambiguity. Hold a question whose prerequisite is still open in this round or waiting
   on a running lookup, and name the held questions in one line.
3. Wait for the user's answers. Partial answers are expected: a question the user did not answer
   stays on the frontier under its branch. Do not compute the next round until each given answer is
   understood, disagreement is explicit, and uncertainty is captured as an assumption, decision, or
   follow-up.
4. Settled decisions push the frontier outward and unblock the questions that depended on them.
   Recompute the frontier and ask the next round.

Send every question in the chat message, inside the round's numbering; the useful answer usually
carries a reason or a new option. Number sections `<round>.<branch>` and questions continuously
across the round, so a reply can name a question:

```
## Round 2

### 2.1 Workspace seeding

❓ **Q1 — Seed home**: ...

### 2.2 Routing assertions

📋 **Q2 — Lint rule set**: ...

Assumptions carried unless you object:

- ...
```

## Question shapes

Choose the shape by what is at stake. Present an alternative only when it is practical; never invent
one for ceremony.

- A **decision** has at least two practical options. Ask the question, list the options with the
  tradeoff each carries, and recommend one by saying why it beats the others.
- A **proposal** has one practical shape. State the design, the consequence the user must confirm,
  and what changes if the user rejects it. A proposal has no recommendation line.
- An **assumption** has one practical shape, and a later rejection costs one local change. List
  assumptions at the end of the round for silent consent; they carry into the completion summary
  unless the user objects. A single-shape item whose rejection would reopen another decision or
  change scope is a proposal.

Decision:

```
❓ **Q1 — <question title>**: <the question>

- **<option A>**: <what it costs and what it buys>
- **<option B>**: <what it costs and what it buys>

➡️ <recommended option, and why it beats the others>
```

Proposal:

```
📋 **Q2 — <proposal title>**: <the design in one or two sentences>

Confirm: <the consequence to confirm>. If rejected: <what changes>.
```

## Interview behavior

- Challenge vague, overloaded, or conflicting terms. Propose a canonical term, a tight definition,
  and aliases to avoid.
- Test domain relationships, state transitions, and ownership with concrete edge-case scenarios.
- Verify important claims about current behavior against code. When code and the user's model
  disagree, pause and resolve which should be authoritative.
- Use `AGENTS.md ## Terminology` when present. Update stable domain terms there as they crystallize;
  skip generic programming terms and incidental implementation names.
- Keep the session to questions and evidence gathering, including dispatched disposable prototypes;
  implementing, ticket creation, and enacting the approach belong to the next explicit workflow
  after the handoff.

When terminology is the main unresolved work, recommend `engineering:terminology`.

## Completion

The interview is complete when the frontier is empty: every branch of the decision tree visited,
nothing left silently assumed. Before declaring completion:

1. Summarize the decisions, facts, assumptions, rejected paths, and remaining follow-ups.
2. State why the approach is ready to implement, defer, or reject.
3. Report terminology changes, unresolved questions that need executable evidence, and the
   recommended next explicit workflow. If another manual engineering skill is next, include a
   handoff note with the context to carry forward and its exact `engineering:<skill>` invocation.
4. Ask the user to confirm that shared understanding has been reached.
