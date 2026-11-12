# AGENTS.md mechanics

What changes when the document is a repository instruction file — an `AGENTS.md` or `CLAUDE.md`:
loading is scope-driven, not trigger-driven. The harness decides when the file loads from where it
sits, so placement does most of the work that pointer wording does for other reference.

## The scope ladder

Repository instruction files have their own disclosure ladder, ranked by how much of the repository
the material governs:

1. **Root instruction file** — loaded in every session. Each line taxes every turn, so the
   disclosure test becomes "does every session need this line?", not "does every branch?".
2. **Directory-scoped instruction file** — an `AGENTS.md` in a subdirectory, for material only work
   under that directory needs. Judge placement by where the work happens, not where the topic's
   files sit: put material a session needs while working elsewhere in the root file or behind a
   pointer.
3. **Disclosed reference** — a plain file behind a pointer, for material scoped to a task rather
   than a place.

## Loading

Claude Code loads the root `CLAUDE.md` into every session, and a nested `CLAUDE.md` when the session
reads a file in its directory. Codex loads only the `AGENTS.md` files from the repository root down
to the session's starting directory, and nothing tells its agent to look for nested files. Assume
Codex sessions start at the repository root, so Codex loads only the root `AGENTS.md` on its own:

- **Root byte limit.** Codex cuts the files it loads at `project_doc_max_bytes` without telling the
  agent. Measure the root `AGENTS.md` with `wc -c`. If the repository's `.codex/config.toml` sets
  `project_doc_max_bytes` below 32,768, keep the file at or under that value; otherwise keep it at
  or under 32,768 bytes, the Codex default. Ignore a higher project value: Codex applies
  `.codex/config.toml` only in a trusted project. When the root file does not fit, move material
  down the scope ladder.
- **Nested index.** In the root `AGENTS.md`, list exactly the nested `AGENTS.md` files that exist,
  each with a path predicate, such as "Before reading or editing files under `plugins/`, read
  `plugins/AGENTS.md`."

## Composition across agents

Keep one canonical instruction file per scope. When two agents read different filenames, make one
file canonical and have the other import it — for example, `AGENTS.md` as canonical with a sibling
`CLAUDE.md` containing `@AGENTS.md` plus only the guidance that is agent-specific. Give each nested
`AGENTS.md` such a sibling `CLAUDE.md` as well: Claude Code loads a nested `CLAUDE.md`, not a nested
`AGENTS.md`.

## Installed skills

A model-invoked skill's description is already always-loaded context, so an instruction-file line
that restates what the skill does or when it fires is a second copy competing with the first. Name a
skill in the instruction file only to bind scope its description cannot carry: which section it
governs, which conventions override it, or which of its options this repository fixes.

## Terminology sections

When a terminology section needs term, alias, relationship, or format changes, use the
`engineering:terminology` skill if it is available; otherwise leave the section unchanged and report
the proposed changes.

## Review rules

When the project needs review guidance, such as how to rate a finding, keep it in a root `REVIEW.md`
and route to it from a `## Code Review Rules` section of the root instruction file, so every
reviewer reads one file and every other session loads one sentence; otherwise leave out both.

## A default shape

A root-file skeleton — adapt sections to the repository rather than forcing the full set:

```markdown
# Project instructions

## Purpose

What the repository maintains, then "Preserve these outcomes:" with the outcome bullets changes are
judged against.

## Repository model

What kind of repository this is, what lives where, and the ownership boundaries.

## Nested instructions

- Before reading or editing files under `<directory>/`, read `<directory>/AGENTS.md`.

## Project conventions

Testable imperatives: commands, paths, and thresholds.

## Code Review Rules

Before you review a change here or triage review findings on one, read [REVIEW.md](REVIEW.md) and
apply its rules.

## Terminology

Durable domain terms. When a terminology workflow governs this section, name it here.
```

Purpose lists the outcomes changes are judged against, and Project conventions holds only testable
imperatives. Apart from `## Code Review Rules`, the section names and their order are incidental.
