---
name: agent-instructions
description: >-
  Use when creating, editing, tightening, or reviewing files that instruct agents — CLAUDE.md,
  AGENTS.md, SKILL.md, agent definition files, or system-prompt fragments — including reviewing a
  diff to such a file for instruction quality, and before writing the prompt that dispatches a
  sub-agent or delegated task. Provides a house style for unambiguous, auditable instructions, the
  document mechanics for structure, disclosure, completion criteria, and pruning, and guidance for
  one-shot sub-agent prompts. Do not use for technical artifacts such as READMEs or documentation
  (technical-writing); for code comments, commit messages, or chat responses; for maintaining a
  terminology section's terms, aliases, or relationships; for conceptual questions about instruction
  files; or for implementation requests the session codes directly, even when the program is an
  agent; delegating implementation to a sub-agent falls under the dispatch trigger.
license: MIT
metadata:
  original_author: Alex Baker
  mechanics_adapted_from: https://github.com/mattpocock/skills/tree/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/writing-for-agents
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
---

# Agent instructions

Instruction files spend a shared attention budget: every sentence competes with every other, and the
agent resolves ambiguity by pattern, not by charity. This style removes ambiguity and keeps the
budget small.

Apply this style to instruction files and sub-agent prompts only. Within that scope this file
overrides the `prose` base style. Technical artifacts belong to the `technical-writing` skill; chat
responses and other prose belong to `prose`.

## Rules

Ordered by importance. When rules conflict, the earlier rule wins.

1. **Spend the budget deliberately.** Prefer replacing a rule over appending one. Before adding a
   rule, name the failure it prevents; if you cannot, do not add it. Delete rules that tooling
   already enforces (linters, hooks, CI). The environment is a source of truth too: a rule that
   restates `package.json` scripts, config files, or the directory layout is a cache of a cheap
   lookup, and it goes stale. Cache only what no file confesses — the unwritten convention, the
   reason behind a choice, the gotcha.

2. **Keep one source of truth per meaning.** State each meaning in one authoritative place, so
   changing the behavior is a one-place edit. A meaning stated twice costs double maintenance and
   reads as twice as important. Repeat terms; never repeat definitions.

3. **Use one term per concept.** Pick one name for each thing and repeat it exactly. Synonyms read
   as different things. If a file says "the service" in one rule and "the daemon" in another, split
   or merge until each concept has one name.

4. **Inline what every path needs; disclose the rest.** Keep material every reader of the file needs
   in the file. Move material only some branches reach into a separate file behind a pointer. If the
   agent misses a needed reference, sharpen the pointer's wording before inlining the material — the
   wording, not the target, decides whether the pointer fires.

5. **Write pointers as routing predicates.** A pointer — a skill description or a line naming
   another document — decides when its material is reached. Use the shape "Use when [triggers]. Do
   not use for [exclusions]." Name concrete artifacts and verbs, not topics, and keep one trigger
   per distinct branch.

6. **Write imperatives with a named actor.** "Run `make test` before you commit", not "tests should
   be run". Passive voice hides who acts and when the rule fires.

7. **Put the condition before the instruction.** "If the branch is `main`, create a branch first",
   not "Create a branch first if the branch is `main`". The condition scopes the action before the
   action is read.

8. **Frame rules positively.** State the behavior you want; naming forbidden behavior makes it more
   available, and the prohibition half-reads as an instruction to do the thing. When you must
   prohibit, state the replacement: "Use the `logger` module for output; `print` is allowed only in
   `scripts/`", not "Do not use print statements".

9. **Make every rule testable.** A rule passes this test when a reviewer can check compliance from
   the diff alone. "Run `make lint` before committing" is testable; "ensure code quality" is a mood.
   Use commands, paths, and thresholds.

10. **End steps on checkable, demanding completion criteria.** For workflow documents, each step
    ends on the condition that tells the agent the work is done. "Every modified model accounted
    for" forces thorough work; "produce a change list" does not. If the agent finishes a step early,
    sharpen the bound before restructuring the workflow.

11. **Order rules by importance.** Boundaries and safety rules first, workflow rules next, style
    preferences last. Early rules get more weight than late ones.

12. **Resolve every pronoun.** Replace a bare "this", "it", or "they" with its noun when the
    antecedent is more than one sentence away or when two candidates exist.

13. **Prefer one example over three rules.** For anything format-sensitive — commit messages, file
    layouts, output shapes — show one correct example and, when the wrong shape is common, one
    labeled counter-example. Agents imitate examples more reliably than they apply rules.

14. **Anchor repeated concepts with leading words.** When several sentences restate one concept,
    collapse them into a compact term the model already holds (tracer bullet, tight loop, frontier)
    and repeat the term exactly. A word too weak to change behavior is a no-op; choose a stronger
    word, not more sentences.

## What not to optimize or remove

- Word simplicity. "Utilize" and "prior to" parse fine; substituting plain words buys nothing here.
  Spend edits on ambiguity and budget instead.
- Tone. Instruction files need no warmth, transitions, or motivation beyond the failure-naming that
  "spend the budget deliberately" requires. Cut sentences that only set tone.
- Anchor rules. A rule the model would follow by default can still earn its keep: it documents the
  convention and gives reviews something to hold future changes against. When judging a deletion,
  ask "does this settle a question that recurs?", not only "would the model comply without it?".

## Structural decisions

When you create a document, split or merge documents, move material between files, or decide what
stays always-loaded, read [document-mechanics.md](references/document-mechanics.md) for the
mechanics: the two loads, the information hierarchy, completion criteria, splitting, leading words,
and pruning.

## Repository instruction files

If the document is an `AGENTS.md` or `CLAUDE.md`, also read [agents-md.md](references/agents-md.md)
for the scope ladder, composition across agents, the installed-skill duplication rule,
terminology-section handling, and a default section shape.

## Skills

If the document is a `SKILL.md`, also read [skill-mechanics.md](references/skill-mechanics.md) for
the invocation choice, trigger contracts, splitting by invocation, and router skills. The
repository's own conventions own metadata keys, file placement, and validation; follow them over the
generic mechanics where they conflict.

## Sub-agent prompts

If the document is a prompt for a sub-agent — a one-shot task dispatch rather than a durable file —
read [subagent-prompts.md](references/subagent-prompts.md) for what changes when the instructions
live for a single dispatch: the context the prompt must carry, the return contract, and decision
rules in place of clarification.

## Review

When auditing a diff to an instruction file, or sweeping a whole file for sediment, work through
[review-checklist.md](references/review-checklist.md). Instruction files grow by accretion, and
every existing rule must keep earning its place. Treat the audit as done when every changed line has
answered its checklist questions, and the file's net rule count is equal or lower — or each addition
named the failure it prevents.

## Examples

Bad, then good:

- "The tests should be run regularly." → "Run `make test` before you commit."
- "Be careful with database migrations." → "If a change adds a migration, run `make migrate-dry` and
  paste the output into the PR description."
- "Avoid committing secrets. This is very important." → "Store secrets in 1Password and reference
  them via `op://` URIs. Files matching `.env*` stay untracked."
- Description, bad: "A skill for helping with documentation quality." → Good: "Use when writing or
  editing files under `docs/`. Do not use for code comments, README badges, or chat responses."
