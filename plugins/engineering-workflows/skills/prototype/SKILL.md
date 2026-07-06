---
name: prototype
description: >-
  Create a disposable prototype to answer a design question before real implementation. Use when the
  user explicitly asks to prototype, try a few designs, sanity-check state or data shape, build
  something throwaway to play with, or explore an assumption during brainstorm or grill-me.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/aaf2453fbdfe7a15c07f11d861224f34ab4b53cb/skills/engineering/prototype
disable-model-invocation: true
argument-hint: "[design-question]"
---

# Prototype

Build throwaway code that answers one question before committing to a real implementation path.

Use this in the middle of `engineering-workflows:brainstorm` or `engineering-workflows:grill-me`
when discussion needs executable evidence. Do not use it for code that is intended to land in the
codebase; use `engineering-workflows:build` or `engineering-workflows:tdd` for that.

## Outcome

Create a runnable disposable artifact, let the user or agent inspect what it proves, then capture
the answer and either delete the prototype or hand the validated decision to a real implementation
workflow.

## Allowed Side Effects

- Create ignored local artifacts under `.local/prototypes/<slug>/` for isolated experiments.
- Create a repo-local worktree under `.local/worktrees/<slug>/` when the prototype needs to build
  on, route through, or integrate with repository code.
- Add source-adjacent files only when the host framework requires them for a realistic prototype;
  name them with `prototype` and keep them easy to delete.
- Add one local run command when the project task runner supports it.
- Do not stage, commit, publish, or present prototype code as durable implementation.
- Do not add tests, broad abstractions, production persistence, or unrelated cleanup.

## Choose The Shape

Identify the question the prototype must answer. If the question is ambiguous, state the assumption
and choose the branch that best matches the surrounding code.

- For business logic, state transitions, data shape, or API feel, read
  [LOGIC.md](references/LOGIC.md) and build a tiny interactive terminal app.
- For visual direction, layout, information hierarchy, or UI options, read [UI.md](references/UI.md)
  and build switchable UI variants.

The branch matters. A UI prototype will not prove a state model, and a terminal prototype will not
settle layout.

## Placement

Prefer the least durable location that still gives realistic evidence:

1. Use `.local/prototypes/<slug>/` when the prototype can run independently with fixture data or a
   small copied model.
2. Use `.local/worktrees/<slug>/` when the prototype must import project modules, exercise real
   routing, run the app, or integrate with the build system. Create the worktree from the current
   branch unless the user asks for a different base.
3. Use source-adjacent prototype files only when the framework cannot realistically host the
   experiment from `.local/`. Mark filenames, routes, comments, and run commands as prototype-only.

If a worktree is used, keep the main checkout clean and report the worktree path. Delete the
worktree or leave a clear cleanup instruction when the prototype is done.

## Subagent Use

Use a subagent when the prototype is a detour inside an active `engineering-workflows:brainstorm` or
`engineering-workflows:grill-me` session and the implementation steps would distract from the main
decision thread. The parent session owns the design context; the subagent owns the disposable build.

Decision tree:

1. If the user invoked `prototype` directly, build in the main thread unless the prototype is large,
   read-heavy, or independently runnable enough that a subagent would materially protect context.
2. If `brainstorm` or `grill-me` handed off a specific executable question, prefer a subagent.
3. If the prototype needs a `.local/worktrees/<slug>/` worktree, prefer a subagent so checkout
   setup, dependency probing, and implementation details stay out of the parent session.
4. If the prototype needs live user steering, shared browser inspection, or rapid interactive edits,
   keep it in the main thread unless the user explicitly wants delegation.
5. If no subagent capability is available, continue in the main thread and keep updates focused on
   the question, run command, observed result, and cleanup state.

Give the subagent a narrow contract:

- the exact question to answer
- the prototype branch to use: logic or UI
- the placement decision: `.local/prototypes/<slug>/`, `.local/worktrees/<slug>/`, or
  source-adjacent
- the allowed side effects and cleanup expectation
- the output contract below

The subagent should return only:

- prototype path and run command or URL
- what it built
- what the prototype shows
- cleanup status or remaining disposable files
- blockers or missing evidence

The parent session should then connect that result back to the active brainstorm or grill-me
decision and decide whether to continue questioning, reject the direction, or move to
`engineering-workflows:build` or `engineering-workflows:tdd`.

## Workflow

1. State the question in the prototype file, README, or first chat update.
2. Pick the smallest runtime and command that match the project conventions.
3. Build only enough code to make the question inspectable.
4. Surface the relevant state after every action or variant switch.
5. Give the user one command or URL to run.
6. Capture the answer in chat or a local `NOTES.md` next to the prototype.
7. Delete the prototype or hand the chosen decision to `engineering-workflows:build` or
   `engineering-workflows:tdd`.

## Completion

End with:

- The question the prototype answered.
- The prototype path and run command or URL.
- What was learned.
- Whether the prototype should be deleted, kept briefly for user inspection, or folded into real
  implementation work.

If the next step is a real implementation workflow, include a handoff note with why prototype work
is stopping, the decision and evidence to carry forward, and the exact `engineering-workflows:build`
or `engineering-workflows:tdd` skill for the user to invoke explicitly with their agent's
skill-invocation syntax.

Stop when the prototype answers the question, when the user chooses a direction, or when realistic
evidence requires setup or access that is unavailable.
