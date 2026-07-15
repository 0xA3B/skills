---
name: handoff
description: >-
  Compact the current session into a local handoff document so another agent session can continue
  without reconstructing decisions, state, and next actions.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/productivity/handoff
disable-model-invocation: true
argument-hint: "[next-session-focus]"
---

# Handoff

Write a concise continuation document for a fresh agent session.

## Placement

Inside a repository, save the document as `.local/handoffs/<timestamp>-<slug>.md`. The repository's
`.local/` directory is ignored working state, not project documentation. Outside a repository, use
the operating system's temporary directory.

Create only the handoff document and its parent directory. Do not edit project files, stage, commit,
push, or create tracker items.

## Content

Include only context the next session cannot cheaply recover:

- next-session focus, using invocation arguments when supplied;
- current outcome and work completed;
- decisions made and the reasons that constrain later work;
- unresolved questions, blockers, and assumptions;
- exact file paths, URLs, issue or PR references, and commands worth reopening;
- current validation state and any failures still requiring attention;
- working-tree or branch state when it matters to safe continuation;
- the immediate next action;
- suggested skills to invoke explicitly.

Reference existing specs, plans, diffs, commits, issues, and generated artifacts instead of copying
their contents. Keep durable facts in their owning artifacts and make the handoff an index into
them.

Redact secrets, credentials, tokens, personal data unrelated to the task, and sensitive command
output. Do not preserve secret values merely because they appeared earlier in the conversation.

## Completion

Read the saved file back and verify that its pointers resolve locally where practical. Report the
absolute handoff path and one-sentence next action.

Stop when a fresh agent could continue the named focus without reading the full conversation and
without mistaking the handoff for committed project state.
