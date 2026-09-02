# Skill mechanics

What changes when the document is a skill: the invocation choice, the trigger contract, and router
skills. Everything else about writing the body is the universal guidance in `SKILL.md` and
[document-mechanics.md](document-mechanics.md). The repository's own conventions own metadata keys,
file placement, versioning, and validation; follow them over this file where they conflict.

## Invocation

Two postures, trading the two loads:

- A **model-invoked skill** keeps a model-facing description, so the agent can load it autonomously
  and another skill can direct the model to it. The user keeps reach too — model-invocation adds
  agent discovery, never removes the human's. The description is the skill's top-level context
  pointer, always loaded: permanent context load in exchange for discoverability. A model-invoked
  skill whose content is all reference is also a home for shared reference, because other skills can
  reach it.
- A **manual-only skill** is reached only by explicit user invocation. Zero context load, but the
  human is the index that must remember it exists — cognitive load. No other skill can fire it;
  reference a manual-only skill from another document only as a hand off that recommends the
  explicit invocation.

Pick model-invocation only when the agent must reach the skill on its own, or another skill must. If
a skill only ever fires by hand, make it manual-only and pay no context load.

Shared reference that two manual-only skills both need can live in neither: push it to a plain file
outside the skill system that both point at.

## Composing skills

When one skill applies another model-invoked skill during the same workflow, assign ownership by
axis:

- The orchestrating skill owns the authority envelope: whether and when mutation is allowed, the
  workflow sequence, stopping conditions, and terminal outcome.
- The supporting skill owns producing and verifying its artifact, or applying its discipline, within
  the authority passed by the orchestrating skill.

Pass the supporting skill the task inputs, repository constraints, and required outcome. Point to
its instructions instead of copying them into the orchestrating skill. If the supporting skill may
be absent, either stop with a hand off or keep only the fallback behavior required to reach the
workflow's safe terminal outcome; do not duplicate the supporting skill's complete guidance.

## Trigger contracts

The description of a model-invoked skill is the trigger contract that decides when it fires. Apply
the pointer rules from `SKILL.md` and document-mechanics in full:

- Use the routing-predicate shape: "Use when [triggers]. Do not use for [exclusions]." Name concrete
  artifacts and verbs, not topics.
- Keep one trigger per distinct branch; collapse synonyms that rename a single branch.
- Front-load the leading words your prompts actually use.
- Cut identity the body already carries.

When the repository has trigger tooling, validate positive and negative cases on every supported
agent before treating a description change as done.

## Splitting by mode

When a skill runs one of several mutually exclusive workflows per invocation — create vs update vs
review — each mode's steps, formats, and final-response shape are conditional detail: only one mode
is live in any run. Move each mode into its own reference file, keep the rules every mode shares in
`SKILL.md`, and route with a per-mode pointer predicate that names which file to read for which
request. When one mode can flow into another, end its reference with a pointer to the next mode's
file.

Split only when each mode owns a substantial body of exclusive instructions. Modes that share one
workflow spine and differ by a stopping point, a parameter, or a small delta stay inline as branch
rules — splitting them either duplicates the spine in every file or yields references too thin to
earn the pointer hop.

## Splitting by invocation

Split off a model-invoked skill when a distinct leading word should trigger it on its own — a
trigger word you actually use in prompts — or when another skill must reach it. The new skill's
always-loaded description must be worth its load.

## Router skills

When manual-only skills multiply past what the human remembers, add one manual-only **router skill**
that names the others and when to reach for each, so the human remembers one skill instead of many.
A router can only recommend; nothing but the human can fire a manual-only skill.
