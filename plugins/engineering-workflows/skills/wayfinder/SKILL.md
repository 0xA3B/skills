---
name: wayfinder
description: >-
  Turn a loose or oversized idea into a breadth-first map of its destination, known facts, open
  decisions, meaningful work chunks, dependencies, frontier, unresolved fog, and excluded scope. Use
  when the user wants to brainstorm, scope a large effort, decompose an unclear goal, or find the
  next decisions before deeper planning or implementation.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/391a2701dd948f94f56a39f7533f8eea9a859c87/skills/engineering/wayfinder
disable-model-invocation: true
argument-hint: "[idea]"
---

# Wayfinder

Wayfind through a loose idea before committing to an approach. Work breadth-first: chart the
decision space and the first actionable frontier without resolving every branch.

## Outcome

Produce a tracker-neutral decision map that names the destination, scope boundary, known facts, open
decisions, dependencies, work chunks, and next useful workflow. The map should make a large effort
navigable without turning planning into implementation.

## Allowed Side Effects

- Inspect repository code, docs, tests, history, issues, and local artifacts.
- Research current external sources when packages, APIs, ecosystem behavior, pricing, product
  behavior, or examples affect the map.
- Create no durable artifacts, project docs, issues, specs, branches, or implementation changes.
- Keep scratch notes temporary and do not present them as project state.

## Chart The Map

### 1. Name The Destination

State what reaching the end of this effort means in one or two sentences. Separate the destination
from attractive follow-on work; the destination defines the scope boundary.

If the destination is still a user decision, ask one focused question and provide a recommendation.
If it is a fact discoverable from the environment, inspect instead of asking.

### 2. Establish The Known Ground

Gather only enough evidence to map the space:

- facts already established by the repository, tools, or current sources;
- decisions the user has already made;
- constraints and dependencies that shape later decisions;
- explicit rejected or out-of-scope paths.

Challenge vague domain terms. Use concrete edge cases when a relationship, state transition, or
ownership boundary is unclear, and verify important claims against code.

### 3. Map Breadth-First

Fan out across the effort before going deep on one path. Create meaningful chunks sized for a future
focused session. Each chunk should name the question or outcome it resolves, not prescribe a
premature implementation.

Classify each visible chunk by its best next workflow:

- research for an external or repository fact;
- `engineering-workflows:grill-me` for a user-owned decision;
- `engineering-workflows:prototype` for executable evidence;
- `engineering-workflows:build` or `engineering-workflows:tdd` only when the shape is already clear
  enough to implement;
- a manual prerequisite when access, setup, or human action blocks a later decision.

Record dependencies between chunks. The **frontier** is the set that is precise, unblocked, and
useful to start next.

### 4. Preserve The Fog

Put in-scope questions that cannot yet be stated precisely under **Not yet specified**. Do not
manufacture detailed chunks for work whose shape depends on unresolved decisions.

Keep deliberately excluded work under **Out of scope**. Fog may become actionable later; excluded
scope does not return unless the destination changes.

### 5. Stop At The Map

Do not resolve mapped chunks, prototype, implement, create tickets, or produce a spec during this
workflow. If the entire effort is already clear and small enough for one session, say that a map is
unnecessary and recommend the next explicit workflow instead.

## Output

End with:

- **Destination**
- **Known facts and decisions**
- **Frontier**: actionable chunks, dependencies, and recommended next workflow
- **Blocked chunks**
- **Not yet specified**
- **Out of scope**
- **Evidence gathered**
- **Recommended next action**

When the map should survive into another session, recommend an explicit invocation of
`engineering-workflows:handoff` and include the focus it should preserve.

Stop when the breadth of the effort is visible, the frontier is actionable, and remaining fog is
named without being prematurely sliced.
