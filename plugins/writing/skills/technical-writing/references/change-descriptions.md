# Change descriptions

Use this reference for pull request and merge request descriptions. Work within the repository's
description template when one exists; preserve its required headings and fields. Treat the elements
below as content checks, not a mandatory template:

- Start with why the change exists: the problem, need, or intended outcome.
- Describe the solution at the design level and explain why it was selected. Do not inventory
  commits, files, or diff details that are apparent during review. When structure is the point, such
  as a call flow, a file layout, or a state change, show it as a short diff, tree, or diagram next
  to the sentence it supports.
- Name intentional boundaries so reviewers can distinguish excluded work from omissions.
- Call out reviewer-sensitive risks: a change that is hard to reverse after it merges, such as a
  migration or a destructive action; what the change can break outside the code it touches; rollout
  requirements; compatibility constraints; and areas that need focused attention.
- Link related issues or tickets. Use the forge's closing syntax only when the change fully resolves
  the issue and targets a branch where the forge performs automatic closure, normally the default
  branch. Otherwise, use a non-closing reference.
- Report validation evidence that required CI does not already communicate: for a behavior change,
  the before and the after as command output, a test that failed and now passes, or a screenshot
  when the change is visual; relevant manual and local-only checks; material checks that were not
  run; and known failures. Omit a checklist that repeats visible required CI.
- Identify follow-up work that should not block the current change.

Keep the description aligned with the effective diff, and short enough that a reviewer reads it in
under a minute: remove planned work that did not land, and link logs, commit lists, and metric
tables instead of pasting them.
