---
name: plan
description: >-
  Interview the user about a plan or design until the important decisions, dependencies, and edge
  cases are clear. Use when the user asks to plan work, stress-test an approach, turn a brainstormed
  direction into an implementation-ready plan, or resolve an ambiguous design before implementation.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/productivity/grill-me
---

# Plan

Interview the user about the plan until there is a shared understanding of the shape of the work.
Walk the decision tree one branch at a time, resolving dependencies before moving deeper.

## Outcome

Produce a plan that is specific enough to implement, defer, or reject. The session should resolve
the decisions that materially affect implementation, risk, scope, product behavior, or validation.

## Behavior

- Ask one question at a time and wait for the user's answer.
- For each question, include the answer you recommend and the tradeoff it resolves.
- If a question can be answered by inspecting the repository or running a targeted web search,
  gather that evidence instead of asking.
- Use `AGENTS.md` when it exists, especially its `## Glossary` section, to align questions with the
  project's domain language.
- Ask the next question that most reduces implementation risk or decision ambiguity.
- Challenge vague, overloaded, or conflicting terms. Propose a canonical term, define it in one
  tight sentence, and name aliases to avoid.
- When a stable domain term emerges, update the `## Glossary` section in `AGENTS.md`. Create the
  section if needed. Include relationships between terms when they clarify ownership, lifecycle, or
  cardinality.
- Only add terms relevant to domain experts or project maintainers. Skip generic programming terms
  and incidental class, function, or module names unless they are part of the domain language.
- Do not implement the plan.
- Stop when the plan is specific enough to implement, defer, or reject.

## Output

When the planning session is complete, summarize:

- The decisions that were made.
- Glossary terms added, changed, or intentionally deferred.
- The assumptions that remain.
- The next implementation or planning step.
