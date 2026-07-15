---
name: codebase-design
description: >-
  Design deeper module interfaces and better seams in concrete repository code. Use when asked to
  design or improve a specific module interface, deepen shallow wrappers, compare interface designs,
  choose a seam, reduce caller knowledge, improve testability through an interface, or apply the
  shared codebase-design model. Do not use for direct bug fixes, generic code review,
  implementation-only requests, or conceptual architecture questions.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/engineering/codebase-design
user-invocable: false
---

# Codebase Design

Design deep modules: useful behavior behind a small interface, placed at a real seam and testable
through that interface. Use this vocabulary consistently wherever code is designed or restructured.

## Vocabulary

- **Module**: anything with an interface and an implementation; scale-agnostic across functions,
  classes, packages, or tier-spanning slices.
- **Interface**: everything a caller must know, including types, invariants, ordering, errors,
  configuration, and performance characteristics.
- **Implementation**: behavior hidden inside a module.
- **Depth**: leverage at the interface. A deep module provides substantial behavior behind a small
  interface; a shallow module exposes nearly as much complexity as it hides.
- **Seam**: the location where an interface lives and behavior can vary without editing callers.
- **Adapter**: a concrete implementation that satisfies an interface at a seam.
- **Leverage**: capability callers receive per unit of interface they must learn.
- **Locality**: change, bugs, knowledge, and verification concentrated behind one interface.

Prefer these terms over ambiguous substitutes such as component, service, API, or boundary when the
codebase-design meaning is intended.

## Principles

- Depth belongs to the interface, not implementation size.
- Apply the deletion test: if removing a module makes complexity disappear, it was likely
  pass-through; if complexity spreads into callers, the module was earning its keep.
- Treat the interface as the test surface. Tests that must reach past it indicate the wrong seam or
  module shape.
- One adapter usually means a hypothetical seam; two adapters usually establish real variation.
- Accept dependencies at real seams instead of constructing them inside behavior that needs testing.
- Return observable results where practical instead of hiding all behavior in side effects.
- Keep names aligned with `AGENTS.md ## Terminology` when that section exists.

When a design candidate depends on filesystem, process, database, network, or third-party behavior,
read [DEEPENING.md](references/DEEPENING.md) before choosing the seam and test strategy.

When the interface itself is the unresolved decision, read
[DESIGN-IT-TWICE.md](references/DESIGN-IT-TWICE.md) and compare materially different designs before
recommending one.

Stop when the interface knowledge, seam placement, hidden behavior, dependency strategy, and test
surface are explicit enough for the owning workflow to continue.
