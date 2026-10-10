---
name: agent-instructions
description: >-
  Use when creating, editing, tightening, or reviewing files that instruct agents — AGENTS.md,
  CLAUDE.md, SKILL.md and its bundled scripts, agent definitions, or system-prompt fragments —
  including a supplied diff to one, and when handing any task to a sub-agent or background agent,
  however small, before writing its prompt. Do not use as the entry point for reviewing the
  session's own changes, which a review workflow owns; for READMEs or other docs
  (technical-writing); for a terminology section's entries; for conceptual questions about
  instruction files; or for other code the session writes itself, even when the program is an agent.
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
agent resolves ambiguity by pattern, not by charity.

Within the scope its description names, this file overrides the `prose` base style; technical
artifacts belong to the `technical-writing` skill, and chat responses and other prose belong to
`prose`. Where the user's request or the repository's own instructions and conventions govern the
same behavior, they win over this file.

## Rules

Ordered by importance. When rules conflict, the earlier rule wins.

1. **Set degrees of freedom by the cost of a wrong path.** Completion criteria bind every step's
   outcome. This rule decides how tightly to bind the path to that outcome. A path is fragile when a
   wrong turn would cross an authority boundary, change state outside the run, or fail silently
   behind a passing status. A path is also fragile when an observed run already took a wrong turn on
   it. For a fragile path, give an exact command, a fixed order, or a bundled script, and say to
   follow it as written. Leave every other path to the agent with a goal and a default, such as the
   order of independent steps or recovery from a transient error. A wrong turn on those paths fails
   loudly, and the agent can recover from it.

2. **Name the stops.** Name each point where the agent stops for the user: an irreversible or
   outward-facing action the request has not authorized, or a decision only the user can make. Place
   each stop after the reversible work that makes the decision concrete, so the user approves a
   reviewable result rather than a plan. State the actions the workflow authorizes, so that between
   named stops the agent carries the work through to its completion criterion instead of stopping to
   ask.

3. **Spend the budget deliberately.** Prefer replacing a rule over appending one. Before adding a
   rule, name the failure it prevents, in the rule or in the change that adds it; if you cannot, do
   not add it. Delete rules that tooling already enforces (linters, hooks, CI). The environment is a
   source of truth too: a rule that restates `package.json` scripts, config files, the directory
   layout, or `--help` output is a cache of a cheap lookup, and it goes stale. Cache only what no
   file confesses — the unwritten convention, the reason behind a choice, the gotcha.

4. **Keep one source of truth per meaning.** State each meaning in one authoritative place, so
   changing the behavior is a one-place edit. A meaning stated twice costs double maintenance and
   reads as twice as important. Repeat terms; never repeat definitions. When a delivery boundary
   requires a copy, keep one source authoritative and govern the copy as a derived artifact. When
   another instruction source can govern the same behavior — the user's request, repository
   instructions, another skill — state which one wins.

5. **Use one term per concept.** Pick one name for each thing and repeat it exactly. Synonyms read
   as different things. If a file says "the service" in one rule and "the daemon" in another, split
   or merge until each concept has one name.

6. **Inline what every branch needs; disclose the rest.** Keep material every branch of the file
   needs in the file. Move material only some branches reach into a separate file behind a pointer.
   If the agent misses a needed reference, sharpen the pointer's wording before inlining the
   material — the wording, not the target, decides whether the pointer fires. Point to each
   disclosed reference from the entry document, the `SKILL.md` or instruction file the agent loads
   first. An agent may skip a reference reached only through another disclosed reference, or read it
   partway.

7. **Write pointers as routing predicates.** A pointer — a skill description or a line naming
   another document — decides when its material is reached. Write its triggers in the shape "Use
   when [triggers]". Where a sibling pointer or skill should take a request this one also matches,
   add "Do not use for [exclusions]". Name concrete artifacts and verbs, not topics, and keep one
   trigger per distinct branch.

8. **Write imperatives with a named actor.** "Before you commit, run `make test`", not "tests should
   be run". Passive voice hides who acts and when the rule fires.

9. **Put the condition before the instruction.** "If the branch is `main`, create a branch first",
   not "Create a branch first if the branch is `main`". The condition scopes the action before the
   action is read. When the condition limits an action, also name what to do otherwise: "In
   `legacy/`, run `npm`; elsewhere, run `pnpm`", not "Run `npm` only in `legacy/`", which leaves the
   other branch to inference.

10. **State the target and when it applies.** Write the behavior you want with its condition: "When
    the items are parallel, use a list; otherwise write prose", not "Avoid bullet points". A rule
    written to push against one model's default overshoots when the default moves. Defaults also
    differ between models: one under-formats where another over-formats. Let the condition carry the
    force instead of capitals or words like "critical" and "important". When you write a
    prohibition, name a specific pattern the agent produces by default and its replacement: "In
    `scripts/`, write output with `print`; elsewhere, use the `logger` module instead", not "Do not
    use print statements". A vague prohibition such as "avoid a generic look" trades one default for
    another.

11. **Make every rule auditable.** Name the condition, actor, action, and observable evidence or
    terminal state, so a reviewer can verify compliance from the diff, command output, or resulting
    state. In a completion criterion, or a condition that guards a fragile path, replace an
    undefined judgment with an observable predicate or a named user decision. A condition on any
    other path can leave the judgment to the agent.

12. **End steps on checkable, demanding completion criteria.** Each step ends on the condition that
    tells the agent the work is done. "Every modified model accounted for" covers every case and can
    be checked; any list satisfies "produce a change list". If premature completion appears, sharpen
    the criterion before restructuring the workflow.

13. **Order rules by importance.** Boundaries and safety rules first, workflow rules next, style
    preferences last. Early rules get more weight than late ones.

14. **Resolve every pronoun.** When a bare "this", "it", or "they" has its antecedent more than one
    sentence away, or has two candidates, replace the pronoun with its noun.

15. **Prefer one example over three rules.** For anything format-sensitive — commit messages, file
    layouts, output shapes — show one correct example and, when the agent produces the wrong shape
    by default, one labeled counter-example. Follow the correct example with one sentence naming
    what makes it correct, so the agent copies those features and not incidental ones. Agents
    imitate examples more reliably than they apply rules.

16. **Anchor repeated concepts with leading words.** When several sentences restate one concept,
    collapse them into one compact term and repeat the term exactly. When the model already holds a
    fitting term (tracer bullet, tight loop, frontier), choose that one. A word too weak to change
    behavior is a no-op; choose a stronger word, not more sentences.

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
stays always-loaded, read [document-mechanics.md](references/document-mechanics.md) for the two
loads, pointers, the information hierarchy, derived instruction copies, and splitting.

## Line decisions

When you write a workflow's steps, choose the form of a list, table, heading, or command block,
anchor a repeated concept, or sweep a document for lines to cut, read
[line-mechanics.md](references/line-mechanics.md) for completion criteria, formatting, leading
words, and pruning.

## Repository instruction files

If the document is an `AGENTS.md` or `CLAUDE.md`, also read [agents-md.md](references/agents-md.md)
for the scope ladder, composition across agents, the installed-skill duplication rule,
terminology-section handling, and a default section shape.

## Skills

If the document is a `SKILL.md`, also read [skill-mechanics.md](references/skill-mechanics.md) for
the invocation choice, composing skills, trigger contracts, splitting by mode and by invocation, and
router skills.

## Bundled scripts

If a skill bundles a script, or a fragile path takes several commands, parsing, or timing, read
[bundled-scripts.md](references/bundled-scripts.md) for when to bundle a script, the script's
contract and dependencies, and the instruction that runs it.

## Sub-agent prompts

If the document is a prompt for a sub-agent — a one-shot task dispatch rather than a durable file —
read [subagent-prompts.md](references/subagent-prompts.md) for what changes when the instructions
live for a single dispatch: the context the prompt must carry, the return contract, decision rules
in place of clarification, and parallel dispatches.

## Review

When auditing a diff to an instruction file, or sweeping a whole file for stale or redundant lines,
work through [review-checklist.md](references/review-checklist.md). Treat the audit as done when
every line in scope — each changed line of a diff, or each line of a swept file — has answered its
checklist questions, and the report names what it checked and found clean.

## Examples

Bad, then good, then what makes the good version correct:

- "Be careful with database migrations." → "If a change adds a migration, run `make migrate-dry` and
  paste the output into the PR description." The good version opens on its condition and names a
  command and evidence a reviewer can check.
- "Avoid committing secrets. This is very important." → "Store secrets in 1Password and reference
  them with `op://` URIs. Keep files matching `.env*` untracked." The good version names the
  practice to follow instead of the one to avoid, and no intensity word carries the force.
- "A skill for helping with documentation quality." → "Use when writing or editing files under
  `docs/`. Do not use for the generated API reference under `docs/api/`." The good description names
  artifacts and verbs, and excludes only a request its trigger also matches.
