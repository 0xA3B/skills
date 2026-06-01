# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, design it
more than once. Based on "Design It Twice" (Ousterhout): your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md): **module**, **interface**, **seam**, **adapter**,
**leverage**.

## Process

### 1. Frame The Problem Space

Write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see
  [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints; not a proposal, just a way to make the
  constraints concrete

Show this to the user, then proceed to Step 2.

### 2. Generate Alternative Interfaces

Produce at least three radically different interfaces for the deepened module.

Generate the alternatives yourself by default. If the user explicitly asks for parallel agent work,
spawn separate agents only for bounded read-heavy design exploration. Give each subagent an
independent technical brief, tell it to inspect the repository locally, and ask for a concise design
summary rather than raw notes. The main agent compares the designs and owns the recommendation.

Each design brief should include file paths, coupling details, dependency category from
[DEEPENING.md](DEEPENING.md), and what sits behind the seam. Give each design a different
constraint:

- Design A: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry
  point."
- Design B: "Maximise flexibility — support many use cases and extension."
- Design C: "Optimise for the most common caller — make the default case trivial."
- Design D (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and `AGENTS.md ## Glossary` vocabulary so each
design names things consistently with the architecture language and the project's domain language.

Each design should include:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs: where leverage is high and where it is thin

### 3. Present And Compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast
by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam
placement**.

After comparing, give your own recommendation: which design is strongest and why. If elements from
different designs would combine well, propose a hybrid. Be opinionated; the user wants a strong
read, not a menu.
