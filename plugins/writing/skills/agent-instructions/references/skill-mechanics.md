# Skill Mechanics

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

## Splitting by invocation

Split off a model-invoked skill when a distinct leading word should trigger it on its own — a
trigger word you actually use in prompts — or when another skill must reach it. The new skill's
always-loaded description must be worth its load.

## Router skills

When manual-only skills multiply past what the human remembers, add one manual-only **router skill**
that names the others and when to reach for each, so the human remembers one skill instead of many.
A router can only recommend; nothing but the human can fire a manual-only skill.
