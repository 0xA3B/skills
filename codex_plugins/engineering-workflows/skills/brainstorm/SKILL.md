---
name: brainstorm
description: >-
  Explore a goal or problem through repo inspection, research, and one-question-at-a-time idea
  generation until there is a preferred direction ready for adversarial review. Use when the user
  wants to brainstorm, compare possible approaches, research solution options, or find a promising
  direction before stress-testing it.
license: MIT
metadata:
  original_author: Alex Baker
---

# Brainstorm

Explore the problem space before committing to an approach. This is the divergent,
evidence-gathering step before `engineering-workflows:grill-me`.

## Outcome

Produce a preferred direction, promising alternatives, and the open decisions that should be taken
into `engineering-workflows:grill-me`. The session should improve option quality through local
evidence, current external research when useful, and focused user input.

## Allowed Side Effects

- Inspect repository code, docs, tests, issues, and local artifacts.
- Browse the web when external context matters: current docs, packages, APIs, ecosystem practice,
  pricing, product behavior, or examples.
- Do not edit files, create docs, update `AGENTS.md`, update terminology entries, stage, commit, or
  implement the solution.

## Behavior

- Explore one question, option, or solution path at a time.
- Ask one question at a time and wait for the user's answer when user judgment would materially
  change the next path.
- If a question can be answered by inspecting the repository or researching current sources, gather
  that evidence instead of asking.
- For each path, state the evidence, tradeoff, and current recommendation.
- Compare options as they emerge. Avoid dumping a broad idea list without evidence.
- Surface uncertainty and name the evidence that would change the recommendation.
- When an option needs executable evidence before adversarial review, hand off to
  `engineering-workflows:prototype`; do not create prototype code during brainstorming.
- Suggest terminology entries only as possible inputs to `engineering-workflows:terminology` or
  `engineering-workflows:grill-me`; do not make terminology durable during brainstorming.
- Stop when there is a preferred direction ready for adversarial review, or when the remaining
  uncertainty requires a user decision.

## Output

When brainstorming is complete, summarize:

- Recommended direction.
- Promising alternatives.
- Evidence gathered.
- Rejected paths and why.
- Possible terminology entries for terminology review or adversarial review to confirm.
- Open decisions for `engineering-workflows:grill-me`.
- Prototype questions that would reduce uncertainty, if any.
- Suggested first interview question.

If the next step is another engineering workflow skill, include a handoff note with why this
workflow is stopping, the context to carry forward, and the exact `$engineering-workflows:<skill>`
prompt for the user to invoke.
