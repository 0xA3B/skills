# Design it twice

Use this branch when interface shape is the unresolved decision. Compare at least two materially
different designs. Add a third when the first comparison leaves a material tradeoff unresolved, when
several independent design axes matter, or when migration risk justifies broader exploration.
Designs must differ in behavior, knowledge, ownership, or seam placement; cosmetic signature
variations do not count.

## Frame the problem

State:

- constraints every interface must satisfy;
- dependencies and their category from [DEEPENING.md](DEEPENING.md);
- behavior that belongs behind the seam;
- current caller pain and compatibility constraints;
- a small illustrative sketch that grounds the problem without proposing the answer.

## Generate alternatives

Choose the axes the decision turns on and produce one design per chosen axis:

- minimize the interface and maximize leverage per entry point;
- maximize flexibility for known extension needs;
- optimize the common caller so the default path is trivial;
- when relevant, design around ports and adapters for cross-process dependencies.

Generate the designs locally by default. When the user or invoking workflow authorizes parallel
agent exploration and each design needs independent repository reading, dispatch one subagent per
axis.

Each design must include:

- the full interface, including invariants, ordering, errors, configuration, and performance;
- a caller usage example;
- behavior hidden in the implementation;
- dependency and adapter strategy;
- tradeoffs in depth, locality, seam placement, compatibility, and migration.

## Compare

Present the designs distinctly, then recommend one, a specific hybrid, or the current design when
the principles in `SKILL.md` do not justify a structural change. Prefer the interface that gives
callers the most leverage with the least knowledge while keeping change local and the seam realistic
to test.
