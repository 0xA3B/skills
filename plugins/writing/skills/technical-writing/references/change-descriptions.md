# Change descriptions

Use this reference for pull request and merge request descriptions. Work within the repository's
description template when one exists; preserve its required headings and fields. Treat the elements
below as content checks, not a mandatory template:

- Start with why the change exists: the problem, need, or intended outcome.
- Describe the solution at the design level and explain why it was selected. Do not inventory
  commits, files, or diff details that are apparent during review.
- Name intentional boundaries so reviewers can distinguish excluded work from omissions.
- Call out reviewer-sensitive risks, migrations, rollout requirements, compatibility constraints, or
  areas that need focused attention.
- Link related issues or tickets. Use the forge's closing syntax only when the change fully resolves
  the issue and targets a branch where the forge performs automatic closure, normally the default
  branch. Otherwise, use a non-closing reference.
- Report validation evidence that required CI does not already communicate, including relevant
  manual checks, local-only checks, material checks that were not run, and known failures. Omit a
  checklist that merely repeats visible required CI.
- Identify follow-up work that should not block the current change.

Keep the description aligned with the effective diff. Remove planned work that did not land, and do
not repeat details that the diff makes obvious unless they affect review or rollout.
