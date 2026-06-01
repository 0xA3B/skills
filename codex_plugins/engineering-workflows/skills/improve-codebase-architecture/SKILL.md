---
name: improve-codebase-architecture
description: >-
  Find architectural deepening opportunities in a codebase, informed by the project's domain
  language. Use when the user wants refactoring opportunities, better module design, simpler
  interfaces, stronger testability, or a codebase architecture review.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/improve-codebase-architecture
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities: refactors that put more useful
behavior behind simpler interfaces. The goal is better locality, leverage, testability, and
agent-navigability.

## Outcome

Produce a prioritized architecture review grounded in repository evidence, or a concrete
implementation plan for a selected refactor. The first pass is analysis only unless the user
explicitly asks for implementation or durable documentation updates.

## Evidence Rules

- Tie each candidate to specific files, modules, callers, tests, docs, or observed navigation
  friction.
- State uncertainty when evidence is incomplete, and name the evidence that would change the
  recommendation.
- Do not treat a theoretical pattern preference as a candidate unless repository evidence shows
  friction.

## Language

Use this vocabulary consistently in every suggestion. The full definitions live in
[LANGUAGE.md](references/LANGUAGE.md).

- **Module**: anything with an interface and an implementation.
- **Interface**: everything a caller must know to use a module, including types, invariants, error
  modes, ordering, and configuration.
- **Implementation**: the code inside the module.
- **Depth**: leverage at the interface. A deep module provides a lot of behavior behind a simple
  interface. A shallow module exposes nearly as much complexity as it hides.
- **Seam**: where an interface lives; a place behavior can be changed without editing callers in
  place.
- **Adapter**: a concrete thing satisfying an interface at a seam.
- **Leverage**: what callers get from depth.
- **Locality**: what maintainers get from depth: change, bugs, and knowledge concentrated in one
  place.

Key principles:

- Deletion test: if deleting a module makes complexity disappear, it was probably pass-through. If
  deleting it spreads complexity into callers, it was earning its keep.
- The interface is the test surface.
- One adapter usually means a hypothetical seam; two adapters usually means a real seam.

## Workflow

### 1. Explore

Read the project's domain language first when these sources exist:

- `AGENTS.md`, README files, and nearby module docs
- code names in the area under review

Then inspect the codebase using normal Codex tools. Follow the friction:

- Where does understanding one concept require bouncing through many small modules?
- Where are modules shallow?
- Where was code extracted for testability, but the real bugs live in orchestration?
- Where do tightly coupled modules leak across seams?
- Which parts are untested or hard to test through the current interface?
- Which names in code fail to match the domain language?
- Which terms are vague, overloaded, or missing from `AGENTS.md ## Glossary`?

Apply the deletion test to suspected shallow modules.

### 2. Present Candidates

Present a numbered list of deepening opportunities. For each candidate include:

- **Files**: the files or modules involved.
- **Problem**: the architectural friction.
- **Solution**: what would change in plain English.
- **Benefits**: why locality, leverage, or tests improve.
- **Risks**: migration cost, compatibility issues, or uncertainty.
- **Evidence**: the concrete code or doc evidence that supports the candidate.

Use the project's domain language from `AGENTS.md ## Glossary` when available. If an idea conflicts
with established glossary language, surface the mismatch and recommend whether to rename the code,
update the glossary, or defer the terminology decision.

Do not implement the refactor during this first pass unless the user explicitly asked for changes.
Ask which candidate they want to explore or implement.

### 3. Grill The Selected Candidate

Once the user picks a candidate, run a focused planning loop:

- What exact behavior belongs behind the new or deepened interface?
- Which callers should know less after the change?
- Which tests should survive a refactor?
- What data, errors, ordering, or configuration are part of the interface?
- Which compatibility or migration constraints matter?

If new stable domain terms emerge, update the `## Glossary` section in `AGENTS.md`. Create the
section if needed. Prefer canonical terms, one-sentence definitions, aliases to avoid, and useful
relationships between terms. Skip generic programming terms and incidental class, function, or
module names unless they are part of the domain language.

If the user rejects a candidate for a durable reason, include that reason in the review summary so
future architecture reviews do not re-suggest it without new evidence.

For deeper interface exploration, use [INTERFACE-DESIGN.md](references/INTERFACE-DESIGN.md). For the
full deepening model, use [DEEPENING.md](references/DEEPENING.md).

## Completion

End with either:

- A prioritized architecture review and the next decision to make, or
- A concrete implementation plan for the selected refactor, including validation steps.

Stop the first pass once the strongest defensible candidates are clear. Do not keep searching for
additional theoretical refactors after the review has enough evidence to guide the next decision.
