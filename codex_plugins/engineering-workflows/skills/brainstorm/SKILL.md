---
name: brainstorm
description: >-
  Explore a goal or problem through repo inspection, research, and one-question-at-a-time idea
  generation until there is a preferred direction ready for planning. Use when the user wants to
  brainstorm, compare possible approaches, research solution options, or find a promising direction
  before making an implementation plan.
license: MIT
metadata:
  original_author: Alex Baker
---

# Brainstorm

Explore the problem space before committing to a plan. This is the divergent, evidence-gathering
step before `engineering-workflows:plan`.

## Outcome

Produce a preferred direction, promising alternatives, and the open decisions that should be taken
into `engineering-workflows:plan`. The session should improve option quality through local evidence,
current external research when useful, and focused user input.

## Allowed Side Effects

- Inspect repository code, docs, tests, issues, and local artifacts.
- Browse the web when external context matters: current docs, packages, APIs, ecosystem practice,
  pricing, product behavior, or examples.
- Do not edit files, create docs, update `AGENTS.md`, update glossary entries, stage, commit, or
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
- Suggest glossary terms only as possible inputs to `engineering-workflows:plan`; do not make
  terminology durable during brainstorming.
- Stop when there is a preferred direction ready for planning, or when the remaining uncertainty
  requires a user decision.

## Output

When brainstorming is complete, summarize:

- Recommended direction.
- Promising alternatives.
- Evidence gathered.
- Rejected paths and why.
- Possible glossary terms for planning to confirm.
- Open decisions for `engineering-workflows:plan`.
- Suggested first planning question.
