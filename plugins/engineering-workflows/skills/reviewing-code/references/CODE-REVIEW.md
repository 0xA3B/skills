# Code Review Lane

Ask whether the change could behave incorrectly or unsafely.

Look for:

- correctness bugs, edge cases, regressions, and removed behavior;
- error handling, ordering, state-transition, and concurrency failures;
- reliability, compatibility, migration, security, privacy, or data-safety risks;
- missing validation for changed behavior when the absence creates material risk;
- assumptions contradicted by callers, configuration, or runtime behavior.

Trace rather than skim:

- Read the enclosing function of each changed hunk; a defect on an unchanged line of a touched
  function is in scope because the change re-exposes or fails to fix it.
- For every deleted or replaced line, name the invariant or behavior it enforced, then find where
  the new code re-establishes it. An invariant with no new home is a finding.
- For each changed function, check callers and callees for a new precondition, changed return shape,
  new failure mode, or ordering dependency the change introduces.

Use repository guidance and relevant tests as evidence. When a finding rests on repository guidance,
quote the rule and the line that violates it; do not report spirit-of-the-guidance inferences. Avoid
generic style feedback, speculative architecture redesign, and unrelated codebase audits. Report a
Fowler smell here only when it is the mechanism of a concrete correctness or safety problem;
otherwise leave it to simplification or codebase design.
