# Spec Adherence Lane

Compare the review target with the supplied source of intended behavior. Cite that source for every
finding.

Look for:

- requirements that are missing, partial, or contradicted;
- behavior implemented differently from the stated acceptance criteria;
- scope creep not required by the source;
- requirements that appear implemented but fail in the actual code path;
- validation claims that do not prove the specified outcome.

Keep implementation bugs that are independent of the spec in code review. If the source is vague or
conflicts with repository evidence, report the ambiguity instead of inventing the intended behavior.
