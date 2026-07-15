# API And Seam Review Lane

Use this lane only for a new or materially changed caller-facing interface or significant seam.

Ask whether callers receive a simple, complete, compatible contract with useful defaults and clear
failure behavior.

Review:

- method and parameter surface area;
- invariants, lifecycle, ordering, configuration, and error semantics;
- compatibility and migration costs for existing callers;
- whether defaults make the common path easy without hiding dangerous behavior;
- whether callers must understand implementation details or navigate message chains;
- whether the seam reflects real variation and supports credible testing;
- performance characteristics that are part of the caller contract.

Apply `engineering-workflows:codebase-design`. Keep this lane about what callers must know; route
internal module placement to codebase-design review and local expression cleanup to simplification.
