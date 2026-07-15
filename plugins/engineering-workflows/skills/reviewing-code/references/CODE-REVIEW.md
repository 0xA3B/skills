# Code Review Lane

Ask whether the change could behave incorrectly or unsafely.

Look for:

- correctness bugs, edge cases, regressions, and removed behavior;
- error handling, ordering, state-transition, and concurrency failures;
- reliability, compatibility, migration, security, privacy, or data-safety risks;
- missing validation for changed behavior when the absence creates material risk;
- assumptions contradicted by callers, configuration, or runtime behavior.

Use repository guidance and relevant tests as evidence. Avoid generic style feedback, speculative
architecture redesign, and unrelated codebase audits. Report a Fowler smell here only when it is the
mechanism of a concrete correctness or safety problem; otherwise leave it to simplification or
codebase design.
