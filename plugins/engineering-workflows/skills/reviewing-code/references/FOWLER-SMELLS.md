# Fowler Smell Baseline

Treat these as judgment heuristics, never automatic violations. Documented repository conventions
override the baseline, and formatter or linter findings do not need manual duplication.

- **Mysterious Name**: a name does not reveal what a value or behavior means. Rename it; difficulty
  finding an honest name may expose a design problem.
- **Duplicated Code**: the same logic shape appears more than once. Extract the shared behavior when
  doing so reduces variation rather than hiding meaningful differences.
- **Feature Envy**: behavior reaches into another module's data more than its own. Consider moving
  the behavior toward the data it understands.
- **Data Clumps**: the same fields or parameters repeatedly travel together. Consider one domain
  value or request type.
- **Primitive Obsession**: a primitive stands in for a domain concept with meaningful rules. Give
  the concept a type when it concentrates knowledge.
- **Repeated Switches**: the same conditional dispatch recurs. Centralize the dispatch or use a real
  variation mechanism.
- **Shotgun Surgery**: one logical change forces scattered edits. Gather the responsibility behind
  one module or interface.
- **Divergent Change**: one module changes for unrelated reasons. Separate responsibilities along
  evidence-backed seams.
- **Speculative Generality**: abstractions or extension points serve no current requirement. Remove
  them until variation is real.
- **Message Chains**: callers navigate a long object graph. Hide the navigation behind behavior at
  the first meaningful module.
- **Middle Man**: a module mostly delegates without hiding complexity. Remove it or deepen it.
- **Refused Bequest**: an inheritor rejects most inherited behavior. Prefer composition or a smaller
  interface.
