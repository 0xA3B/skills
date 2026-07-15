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
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/productivity/grilling
disable-model-invocation: true
argument-hint: "[approach]"
---

# Grill Me

Interview the user relentlessly until there is shared understanding of the work. Walk the decision
tree one branch at a time, resolving dependencies before moving deeper.

## Outcome

Expose and resolve decisions that materially affect behavior, implementation, risk, scope, or
validation. Finish with an approach the user has explicitly confirmed is specific enough to
implement, defer, or reject.

## Facts And Decisions

- Find facts by inspecting the environment: repository files, history, tools, configured services,
  and current external sources when relevant.
- Do not ask the user to supply facts that can be established safely from available evidence.
- Decisions belong to the user. Present each material choice, your recommendation, and the tradeoff
  it resolves, then wait for the user's answer.
- Keep assumptions distinct from facts and decisions. Make unresolved uncertainty explicit.

## Interview Behavior

- Ask one question at a time and wait for the answer.
- Do not move on until the current answer is understood, disagreement is explicit, and uncertainty
  is captured as an assumption, decision, or follow-up.
- Choose the next question that most reduces implementation risk or decision ambiguity.
- Challenge vague, overloaded, or conflicting terms. Propose a canonical term, a tight definition,
  and aliases to avoid.
- Test domain relationships, state transitions, and ownership with concrete edge-case scenarios.
- Verify important claims about current behavior against code. When code and the user's model
  disagree, pause and resolve which should be authoritative.
- Use `AGENTS.md ## Terminology` when present. Update stable domain terms there as they crystallize;
  skip generic programming terms and incidental implementation names.
- Do not implement, prototype, create tickets, or enact the approach during the interview.

When an unresolved question needs executable evidence, stop that branch and recommend an explicit
invocation of `engineering-workflows:prototype`. When terminology is the main unresolved work,
recommend `engineering-workflows:terminology`.

## Completion

Before declaring the interview complete:

1. Summarize the decisions, facts, assumptions, rejected paths, and remaining follow-ups.
2. State why the approach is ready to implement, defer, or reject.
3. Ask the user to confirm that shared understanding has been reached.

Do not act on the approach until the user confirms completion.

End with terminology changes, prototype questions, and the recommended next explicit workflow. If
another manual engineering skill is next, provide a handoff note with the context to carry forward
and its exact `engineering-workflows:<skill>` invocation.
