# AGENTS.md mechanics

What changes when the document is a repository instruction file — an `AGENTS.md` or `CLAUDE.md`:
loading is scope-driven, not trigger-driven. The harness decides when the file loads from where it
sits, so placement does the work that pointer wording does for other reference. Everything else
about writing the file is the universal guidance in `SKILL.md`,
[document-mechanics.md](document-mechanics.md), and [line-mechanics.md](line-mechanics.md).

## The scope ladder

Repository instruction files have their own disclosure ladder, ranked by how much of the repository
the material governs:

1. **Root instruction file** — always loaded, every session, no gate. Each line taxes every turn, so
   the disclosure test becomes "does every session need this line?", not "does every branch?".
2. **Directory-scoped instruction file** — an `AGENTS.md` in a subdirectory, loaded when the session
   works under that directory. This is progressive disclosure with a path trigger instead of a
   pointer: it fires on any work in the subtree with no wording to sharpen, and it cannot fire
   outside the subtree. Judge placement by where the work happens, not where the topic's files sit:
   put material a session needs while working elsewhere in the repository in the root file or behind
   a pointer.
3. **Disclosed reference** — a plain file behind a pointer, for material scoped to a task rather
   than a place.

The root file and the directory-scoped files on the path to the working directory load together, so
budget them together. Keep that chain under 32 KiB, measured with `wc -c`: Codex reads only the
first 32 KiB of it by default (`project_doc_max_bytes`), and the rest never reaches the agent.

Terminology shows the ladder's use: a term anchors shared language only while it is loaded, so its
rung decides its reach. Keep terms the whole repository speaks in the root file; move terms spoken
only while working under one directory into that directory's instruction file; keep a term needed
only inside one workflow in that workflow's own document.

## Composition across agents

Keep one canonical instruction file per scope. When two agents read different filenames, make one
file canonical and have the other import it — for example, `AGENTS.md` as canonical with a sibling
`CLAUDE.md` containing `@AGENTS.md` plus only the guidance that is agent-specific. Two independently
maintained files for one scope drift into two sources of truth.

## Installed skills

A model-invoked skill's description is already always-loaded context. An instruction-file line that
restates what the skill does or when it fires is a second copy competing with the first; the
duplication rule applies across surfaces, not just within a file. When the repository binds a
model-invoked skill to scope its description cannot carry — which section it governs, which
conventions override it, or which of its options this repository fixes — name the skill in the
instruction file with that scope; otherwise leave the skill unnamed.

## Terminology sections

When a terminology section needs term, alias, relationship, or format changes: if the
`engineering:terminology` skill is available, use it for those changes; otherwise leave the section
unchanged and report proposed changes instead of applying them.

## A default shape

A root-file skeleton — adapt sections to the repository rather than forcing the full set:

```markdown
# Project instructions

## Purpose

What the repository maintains, then "Preserve these outcomes:" with the outcome bullets changes are
judged against.

## Repository model

What kind of repository this is, what lives where, and the ownership boundaries.

## Project conventions

Testable imperatives: commands, paths, and thresholds.

## Dependency policy

How dependencies are chosen, constrained, and updated.

## Terminology

Durable domain terms. When a terminology workflow governs this section, name it here.
```

The skeleton works because Purpose lists the outcomes changes are judged against, Project
conventions holds only testable imperatives, and Terminology names the workflow that governs it; the
section names, their order, and the full set are incidental.
