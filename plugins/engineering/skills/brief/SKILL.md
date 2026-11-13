---
name: brief
description: >-
  Write the decisions, plan, and current state of settled work into a local brief that the session
  keeps current during implementation, so the work survives compaction and sub-agents can read it.
license: MIT
metadata:
  original_author: Alex Baker
disable-model-invocation: true
argument-hint: "[focus]"
---

# Brief

Write a working brief for work whose approach is settled: one local document that holds the
decisions, the plan, and the current state through implementation.

A brief serves one effort in one checkout. When a different session or agent takes over the work,
recommend an explicit invocation of `engineering:handoff`, which snapshots what a fresh session
cannot recover.

## Placement

The brief never becomes tracked project state.

Inside a repository, when project instructions define an ignored scratch convention or an ignored
scratch directory exists, such as `.local/` or `.scratch/`, save the brief as
`<scratch-dir>/briefs/<YYYYMMDD>-<slug>.md`, for example `.local/briefs/20260809-auth-refactor.md`.
Before writing, confirm that Git ignores the path, for example with `git check-ignore`. When no
ignored convention exists, or the path is not ignored, use the operating system's temporary
directory instead of changing ignore rules. Outside a repository, use the temporary directory.

If that directory already holds a brief for the same effort, update that file instead of writing a
second one.

Create only the brief and its parent directory; leave project files, ignore rules, the index,
branches, and trackers untouched.

## Content

Take the content from the conversation: the decisions the user settled, the facts gathered, and the
plan agreed. Do not settle an open decision by writing it down; list it under **Open questions**.
The invocation arguments, when supplied, name the effort.

Start the brief with this header, filling in the placeholders, because a later reader may not have
this skill loaded:

```md
# Brief: <effort>

> Working brief for <one-sentence goal>. Read it before you continue this work: it records the
> decisions and the current state, and the conversation may no longer hold them.
>
> If you were asked to continue this work, you own this file, and updating it is part of each step,
> not a write-up. After you complete a step, make or reverse a decision, learn something that
> changes the plan, or finish a review or validation run, update every section the event changes
> before you start the next step: always **State**, and each **Plan** step whose work or check no
> longer holds. If you were dispatched for one task and given this file as context, leave it
> unchanged and report what should change.
>
> This file is local working state. Do not commit it.
```

The header is correct when no placeholder remains.

Then write these sections, leaving out a section that would be empty:

- **Goal**: the outcome that ends the effort, and what is out of scope.
- **Decisions**: each settled decision with the reason that constrains later work, and each rejected
  path a later reader would otherwise propose again.
- **Open questions**: each unresolved decision or assumption, with who or what resolves it.
- **Plan**: the ordered steps, each with the check that shows the step is done. When terminology
  entries or decision records are still to be written, list them first.
- **State**: the status of each step, the step in progress, the last validation result, and the last
  commit a review covered.
- **Discoveries**: each fact learned during implementation that contradicts a decision or changes
  the plan, with what changed because of it.
- **References**: file paths, issue and change-request references, and commands worth reopening.

Include only what the session cannot cheaply recover from the repository. Reference a tracked file,
a commit, an issue, or a URL instead of copying its content.

Redact secrets, credentials, tokens, and personal data unrelated to the task. Do not preserve a
secret value because it appeared earlier in the conversation.

## Sub-agents

When the session dispatches a sub-agent for part of the work, give the sub-agent the brief's
absolute path and name the sections its task needs. Fold what the sub-agent reports into the brief
yourself.

## Completion

Read the saved file back, and confirm that every file path under **References** exists and that
every commit or branch there resolves locally. Report the brief's absolute path and the first step
of the plan.

Stop when a reader holding only the brief and the repository could continue the work without the
conversation.
