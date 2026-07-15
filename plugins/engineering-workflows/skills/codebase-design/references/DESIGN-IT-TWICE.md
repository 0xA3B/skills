# Design It Twice

Use this branch when interface shape is the unresolved decision. Compare at least three materially
different designs; cosmetic signature variations do not count.

## Frame The Problem

State:

- constraints every interface must satisfy;
- dependencies and their category from [DEEPENING.md](DEEPENING.md);
- behavior that belongs behind the seam;
- current caller pain and compatibility constraints;
- a small illustrative sketch that grounds the problem without proposing the answer.

## Generate Alternatives

Generate the designs locally by default. When the user or invoking workflow authorizes parallel
agent exploration and the design is large enough to benefit, use independent subagents with
different constraints:

- minimize the interface and maximize leverage per entry point;
- maximize flexibility for known extension needs;
- optimize the common caller so the default path is trivial;
- when relevant, design around ports and adapters for cross-process dependencies.

Each design must include:

1. The full interface, including invariants, ordering, errors, configuration, and performance.
2. A caller usage example.
3. Behavior hidden in the implementation.
4. Dependency and adapter strategy.
5. Tradeoffs in depth, locality, seam placement, compatibility, and migration.

## Compare

Present the designs distinctly, then recommend one or a specific hybrid. Prefer the interface that
gives callers the most leverage with the least knowledge while keeping change local and the seam
realistic to test.
