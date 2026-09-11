---
name: prototype
description: >-
  Build a disposable prototype that answers one design question before real implementation. Use when
  the user asks to prototype, spike, or try a throwaway version of something, sanity-check a state
  model or data shape, compare design approaches with switchable variants, or prove that an existing
  system accepts a change before committing to it, and when `engineering:grill-me`,
  `engineering:wayfinder`, or `engineering:tdd` needs executable evidence for an open decision. Do
  not use for code intended to land, which belongs to `engineering:tdd`; for a bug whose cause is
  unknown, which needs diagnosis first; for reviewing existing changes; or for conceptual questions
  about prototyping.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
  upstream_divergence: prototypes are never committed or archived as primary sources
argument-hint: "[design-question]"
---

# Prototype

Build throwaway code that answers one question before committing to a real implementation path.

Keep prototype code disposable: when the code is intended to land in the codebase, stop and hand off
to `engineering:tdd`.

## Outcome

Create a runnable disposable artifact, let the user or agent inspect what it proves, then capture
the answer and either delete the prototype or hand the validated decision to a real implementation
workflow.

## Allowed side effects

- Create disposable prototype artifacts in the locations `## Placement` defines.
- Add one local run command when the project task runner supports it.
- Do not stage, commit, branch, publish, or present prototype code as durable implementation.
- Do not add tests, broad abstractions, production persistence, or unrelated cleanup.

## Choose the shape

Identify the question the prototype must answer. If the question is ambiguous, state the assumption
and choose the branch that best matches the surrounding code.

- For business logic, state transitions, data shape, or interface feel, read
  [LOGIC.md](references/LOGIC.md) and build a single shareable HTML demo anyone can drive.
- For visual direction, layout, information hierarchy, interaction shape, or choosing between design
  approaches, read [UI.md](references/UI.md) and build switchable UI variants.
- For whether an existing system accepts a change, or how a tool, command, or external integration
  behaves, read [EXPERIMENT.md](references/EXPERIMENT.md) and run the real command against a changed
  worktree copy, with a control run first.

A UI prototype will not prove a state model, a logic demo will not settle layout, and neither shows
what a real tool does.

## Placement

Prefer the least durable location that still gives realistic evidence. Use the repository's ignored
scratch convention, confirming the path is ignored with `git check-ignore` before writing; the paths
below assume `.local/` is that convention.

1. Use `.local/prototypes/<slug>/` when the prototype can run independently with fixture data or a
   small copied model.
2. Use a detached `.local/worktrees/<slug>/` worktree when the prototype must import project
   modules, exercise real routing, run the app, integrate with the build system, or run an
   experiment. Base it on the current commit unless the user asks for another revision. When the
   harness creates the worktree itself, such as subagent isolation under `.claude/worktrees/`,
   accept that location and apply the same cleanup.
3. Use source-adjacent prototype files only when the framework cannot realistically host the
   prototype from `.local/`. Mark filenames, routes, comments, and run commands as prototype-only.

If you use a worktree, keep the main checkout clean and report the worktree path. When the prototype
is done, delete the worktree and any branch it created, or leave a clear cleanup instruction.

Before deleting any prototype, whatever its placement, extract into the evidence record the parts a
future implementer would otherwise re-derive: the diff or snippet that answers the question, the
commands run, and the observed results. The extract is reference material for the implementation
workflow, which rebuilds the behavior from tests; it is never a source to merge.

## Subagent use

The parent session owns the design context; the subagent owns the disposable build.

Decision tree. Apply the first item that matches; a later item never overrides an earlier one:

1. If the prototype needs live user steering, shared browser inspection, or rapid interactive edits,
   keep it in the main thread unless the user explicitly wants delegation.
2. If the prototype needs a worktree, prefer a subagent so checkout setup, dependency probing, and
   implementation details stay out of the parent session.
3. If the question comes from a `wayfinder`, `grill-me`, or `tdd` workflow, whether that workflow is
   applying this skill now or handed the question off in a note, prefer a subagent.
4. If the user's request is the prototype itself, build in the main thread unless the prototype is
   large, read-heavy, or independently runnable enough that a subagent would materially protect
   context.
5. If no subagent capability is available, continue in the main thread and keep updates focused on
   the question, run command, observed result, and cleanup state.

Give the subagent a narrow contract:

- the exact question to answer
- the prototype shape to use: logic, UI, or experiment
- the placement decision: `.local/prototypes/<slug>/`, a worktree, or source-adjacent
- the allowed side effects and cleanup expectation
- the output contract below

The subagent returns only:

- prototype path and run command or URL
- what it built
- what the prototype shows; for an experiment, the report `EXPERIMENT.md` defines
- the extract, when the subagent deleted the prototype before returning
- cleanup status or remaining disposable files
- blockers or missing evidence

The parent session then connects that result back to the active decision and decides whether to
continue questioning, reject the direction, or hand off to `engineering:tdd`.

## Workflow

1. State the question in the prototype file, README, or first chat update.
2. Pick the smallest runtime and command that match the project conventions.
3. Build only enough code to make the question inspectable.
4. Surface the relevant state after every action or variant switch.
5. Give the user one command, URL, or file to open.
6. Capture the evidence record: the question, observed evidence, extract, and decision, in chat or a
   local `NOTES.md` next to the prototype.

## Completion

End with:

- The question the prototype answered.
- The prototype path and run command or URL.
- What was learned.
- Whether the prototype should be deleted, kept briefly for user inspection, or reduced to its
  extract for the implementation handoff.

If the next step is a real implementation workflow, include a handoff note with why prototype work
is stopping and the evidence record to carry forward into `engineering:tdd`.

Stop when the prototype answers the question, when the user chooses a direction, or when realistic
evidence requires setup or access that is unavailable.
