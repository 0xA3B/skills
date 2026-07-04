---
name: grill-me
description: >-
  Interview the user through an adversarial line of questioning until the important decisions,
  dependencies, and edge cases are clear. Use when the user asks to stress-test an approach, get
  grilled on a design, challenge a brainstormed direction, or resolve ambiguity before
  implementation.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/productivity/grill-me
---

# Grill Me

Interview the user about the approach until there is a shared understanding of the shape of the
work. Walk the decision tree one branch at a time, resolving dependencies before moving deeper.
Treat the session as a rigorous design review, not a promise to produce a formal implementation
artifact.

## Outcome

Expose and resolve the decisions that materially affect implementation, risk, scope, product
behavior, or validation. The approach should become specific enough to implement, defer, or reject.

## Behavior

- Ask one question at a time and wait for the user's answer.
- For each question, include the answer you recommend and the tradeoff it resolves.
- If a question can be answered by inspecting the repository or running a targeted web search,
  gather that evidence instead of asking.
- Use `AGENTS.md` when it exists, especially its `## Terminology` section, to align questions with
  the project's domain language.
- Do not move on to the next question until the current answer is understood, any disagreement is
  explicit, and unresolved uncertainty has been captured as an assumption, decision, or follow-up.
- Ask the next question that most reduces implementation risk or decision ambiguity.
- Challenge vague, overloaded, or conflicting terms. Propose a canonical term, define it in one
  tight sentence, and name aliases to avoid.
- When a decision cannot be resolved by questioning or repository inspection, hand off to
  `engineering-workflows:prototype`; do not create prototype code during the interview.
- When terminology becomes the main unresolved work, hand off to
  `engineering-workflows:terminology`.
- When a stable domain term emerges, update the `## Terminology` section in `AGENTS.md`. Create the
  section if needed. Include relationships between terms when they clarify ownership, lifecycle, or
  cardinality.
- Only add terms relevant to domain experts or project maintainers. Skip generic programming terms
  and incidental class, function, or module names unless they are part of the domain language.
- Do not implement the approach.
- Stop when the approach is specific enough to implement, defer, or reject.

## Output

When the interview is complete, summarize:

- The decisions that were made.
- Terminology entries added, changed, or intentionally deferred.
- The assumptions that remain.
- Prototype questions that should be answered before implementation, if any.
- The next implementation or review step.

If the next step is another engineering workflow skill, include a handoff note with why this
workflow is stopping, the context to carry forward, and the exact `$engineering-workflows:<skill>`
prompt for the user to invoke.
