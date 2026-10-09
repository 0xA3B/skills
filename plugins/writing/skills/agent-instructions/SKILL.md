---
name: agent-instructions
description: >-
  Use when creating, editing, tightening, or reviewing files that instruct agents — CLAUDE.md,
  AGENTS.md, SKILL.md, agent definition files, or system-prompt fragments — including reviewing a
  supplied diff to such a file for instruction quality, and before writing the prompt that
  dispatches a sub-agent or delegated task. Provides the house style for unambiguous, auditable
  instructions, the document mechanics, and guidance for one-shot sub-agent prompts. Do not use as
  the entry point for reviewing a session's own changes before a commit or PR, which a review
  workflow owns and applies this skill inside; for READMEs or other documentation
  (technical-writing); for code comments, commit messages, or chat responses; for maintaining a
  terminology section's terms, aliases, or relationships; for conceptual questions about instruction
  files; or for implementation requests the session codes directly, even when the program is an
  agent; delegating implementation to a sub-agent falls under the dispatch trigger.
license: MIT
metadata:
  original_author: Alex Baker
  mechanics_adapted_from: https://github.com/mattpocock/skills/tree/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/writing-for-agents
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
  upstream_divergence: >-
    allows a prohibition that names a specific default pattern with its replacement, and drops the
    claim that naming a behavior makes it more available; upstream allows only a hard guardrail
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

2. **Set degrees of freedom by the cost of a wrong path.** Completion criteria bind every step's
   outcome. This rule decides how tightly to bind the path to it. A path is fragile when a wrong
   turn would cross an authority boundary, change state outside the run, or fail silently behind a
   passing status. A path is also fragile when an observed run already took a wrong turn on it. For
   a fragile path, give an exact command, a fixed order, or a bundled script, and say to follow it
   as written. Leave every other path to the agent with a goal and a default, such as the order of
   independent steps or recovery from a transient error. A wrong turn on those paths fails loudly,
   and the agent can recover from it.

3. **Name the stops.** Name each point where the agent stops for the user: an irreversible or
   outward-facing action the request has not authorized, or a decision only the user can make. Place
   each stop after the reversible work that makes the decision concrete, so the user approves a
   reviewable result rather than a plan. State the actions the workflow authorizes, so the agent
   does not stop to ask for them. Between named stops, the agent carries the work through to its
   completion criterion.

4. **Keep one source of truth per meaning.** State each meaning in one authoritative place, so
   changing the behavior is a one-place edit. A meaning stated twice costs double maintenance and
   reads as twice as important. Repeat terms; never repeat definitions. When a delivery boundary
   requires a copy, keep one source authoritative and govern the copy as a derived artifact.

5. **Use one term per concept.** Pick one name for each thing and repeat it exactly. Synonyms read
   as different things. If a file says "the service" in one rule and "the daemon" in another, split
   or merge until each concept has one name.

6. **Inline what every path needs; disclose the rest.** Keep material every reader of the file needs
   in the file. Move material only some branches reach into a separate file behind a pointer. If the
   agent misses a needed reference, sharpen the pointer's wording before inlining the material — the
   wording, not the target, decides whether the pointer fires.

7. **Write pointers as routing predicates.** A pointer — a skill description or a line naming
   another document — decides when its material is reached. Use the shape "Use when [triggers]. Do
   not use for [exclusions]." Name concrete artifacts and verbs, not topics, and keep one trigger
   per distinct branch.

8. **Write imperatives with a named actor.** "Run `make test` before you commit", not "tests should
   be run". Passive voice hides who acts and when the rule fires.

9. **Put the condition before the instruction.** "If the branch is `main`, create a branch first",
   not "Create a branch first if the branch is `main`". The condition scopes the action before the
   action is read.

10. **State the target and when it applies.** Write the behavior you want with its condition: "Use a
    list when the items are parallel", not "Avoid bullet points". A rule written to push against one
    model's default overshoots when the default moves. Defaults also differ between models: one
    under-formats where another over-formats. Let the condition carry the force instead of capitals
    or words like "critical" and "important". Prohibit only a specific pattern the agent produces by
    default, and name the replacement: "Use the `logger` module for output; `print` is allowed only
    in `scripts/`", not "Do not use print statements". A vague prohibition such as "avoid a generic
    look" trades one default for another.

11. **Make every rule auditable.** Name the condition, actor, action, and observable evidence or
    terminal state. A reviewer must be able to determine which branch applies and verify compliance
    from the diff, command output, or resulting state. In a condition or completion criterion,
    replace an undefined judgment with an observable predicate or a named user decision; a path that
    degrees of freedom leaves to the agent needs no predicate beyond its completion criterion.

12. **End steps on checkable, demanding completion criteria.** For workflow documents, each step
    ends on the condition that tells the agent the work is done. "Every modified model accounted
    for" forces thorough work; "produce a change list" does not. If the agent finishes a step early,
    sharpen the bound before restructuring the workflow.

13. **Order rules by importance.** Boundaries and safety rules first, workflow rules next, style
    preferences last. Early rules get more weight than late ones.

14. **Resolve every pronoun.** Replace a bare "this", "it", or "they" with its noun when the
    antecedent is more than one sentence away or when two candidates exist.

15. **Prefer one example over three rules.** For anything format-sensitive — commit messages, file
    layouts, output shapes — show one correct example and, when the wrong shape is common, one
    labeled counter-example. Agents imitate examples more reliably than they apply rules.

16. **Anchor repeated concepts with leading words.** When several sentences restate one concept,
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

## Bundled scripts

If a skill bundles a script, or a fragile path takes several commands, parsing, or timing, read
[bundled-scripts.md](references/bundled-scripts.md) for when to bundle a script, the script's
contract and dependencies, and the instruction that runs it.

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
