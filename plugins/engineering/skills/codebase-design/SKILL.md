---
name: codebase-design
description: >-
  Design deeper module interfaces and better seams in concrete repository code. Use when asked to
  design or improve a specific module interface, deepen shallow wrappers, compare interface designs,
  choose a seam, reduce caller knowledge, improve testability through an interface, or when another
  workflow or review lane directs applying engineering:codebase-design. Do not use for direct bug
  fixes, generic code review, implementation-only requests, or conceptual architecture questions.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/engineering/codebase-design
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
user-invocable: false
---

# Codebase design

Design deep modules: useful behavior behind a small interface, placed at a real seam and testable
through that interface.

## Vocabulary

- **Module**: anything with an interface and an implementation; scale-agnostic across functions,
  classes, packages, or tier-spanning slices.
- **Interface**: everything a caller must know, including types, invariants, ordering, errors,
  configuration, and performance characteristics. Measure its size by that knowledge, not by the
  count of methods or parameters; a generic payload or callback can expose more protocol than
  several specific operations.
- **Implementation**: behavior hidden inside a module.
- **Depth**: leverage at the interface. A deep module provides substantial behavior behind a small
  interface; a shallow module exposes nearly as much complexity as it hides. Implementation size
  does not make a module deep.
- **Seam**: the location where an interface lives and behavior can vary without editing callers.
- **Adapter**: a concrete implementation that satisfies an interface at a seam.
- **Port**: the interface a module declares at a seam for a dependency it does not own.
- **Leverage**: capability callers receive per unit of interface they must learn.
- **Locality**: change, bugs, knowledge, and verification concentrated behind one interface.

Use these terms when their concepts apply, and prefer them over ambiguous substitutes such as
component, service, API, or boundary. Map them to `AGENTS.md ## Terminology` when that section
exists, and keep a clearer established domain term rather than replacing it with the skill's word.

## Principles

- Apply the deletion test: if removing a module makes complexity disappear, it was likely
  pass-through; if complexity spreads into callers, the module was earning its keep.
- A deep module hides one coherent body of knowledge. Split it when independent caller populations,
  dependency categories, or reasons to change accumulate, even while its interface still has
  leverage, and keep the resulting seams private unless callers need the variation. File length or
  method count alone is a prompt to look, not a finding.
- Treat the interface as the test surface. Tests that must reach past it indicate the wrong seam or
  module shape.
- A test adapter proves controllability, not variation. Whether a dependency earns a public port
  follows its category in [DEEPENING.md](references/DEEPENING.md).
- Accept dependencies at real seams instead of constructing them inside behavior that needs testing.
- Return observable results where practical instead of hiding all behavior in side effects.
- Recommend a structural change only when its reduction in caller knowledge, change spread, or
  defect risk exceeds its migration and compatibility cost. An adequate current design stays, with
  its reconsideration trigger recorded.

Before choosing a seam or test strategy, or comparing interface designs, read
[DEEPENING.md](references/DEEPENING.md) to classify the candidate's dependencies.

When the interface itself is the unresolved decision, read
[DESIGN-IT-TWICE.md](references/DESIGN-IT-TWICE.md) and compare materially different designs before
recommending one.

Stop when the recommendation states, in writing: interface knowledge, seam placement, hidden
behavior, dependency strategy, test surface, and the event that would trigger reconsidering it, such
as another caller, another production adapter, a new dependency category, or repeated conditional
routing. When the design holds durable state, also state which module owns each piece of state, its
lifecycle transitions, and its invariants, or the coordination contract when ownership is shared.
Omit an item only when it does not apply to the decision, and say which.
