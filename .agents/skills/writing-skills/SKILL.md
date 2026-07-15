---
name: writing-skills
description: >-
  Skill-body authoring discipline to load before drafting, tightening, or reviewing SKILL.md
  instructions. Use when asked to write a skill body, improve an existing skill's workflow or
  completion criteria, review SKILL.md structure and progressive disclosure, or apply shared
  skill-authoring discipline. Do not use when the requested output is trigger analysis or fixtures,
  plugin or marketplace metadata, or skill installation.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/productivity/writing-great-skills
user-invocable: false
---

# Writing Skills

Write skill bodies that make an agent follow a predictable process. Predictability means repeatable
behavior, not identical output.

## Boundary

Own the semantic quality of `SKILL.md`: what behavior it protects, how it is reached, how its
instructions are arranged, and how completion is judged.

Leave repository structure and metadata to their owning guidance:

- Use `skill-creator` for general skill scaffolding and bundled-resource structure.
- Use repo-local creation workflows such as `add-skill` for repository placement, plugin metadata,
  versioning, and validation.
- Use `update-plugin-metadata` for marketplace, manifest, README, and UI-metadata-only changes.
- Use `optimize-trigger` for implicit-invocation behavior and `pressure-test-skill` for runtime
  behavior under shortcut pressure.

## Author Or Improve

Use the same discipline for a new body and an existing one.

1. Identify the skill's concrete branches and the behavior each branch must make predictable.
2. Decide invocation before writing the body. Make a skill implicit only when the agent or another
   skill must discover it; otherwise keep it manual and avoid permanent context load.
3. Put ordered actions and checkable completion criteria in `SKILL.md`. Put conditional detail,
   catalogs, schemas, and longer examples behind clearly worded pointers in `references/`.
4. State outcomes, allowed side effects, evidence rules, missing-evidence behavior, and stopping
   conditions where they change behavior.
5. Prefer decision rules over exhaustive choreography when context should determine the method.
6. Review every sentence for duplicated meaning, stale sediment, weak no-ops, accidental negation,
   and detail that belongs lower in the information hierarchy.
7. Confirm that every path can tell when it is complete and that post-completion work does not pull
   the agent past a still-fuzzy step.

Read [GLOSSARY.md](references/GLOSSARY.md) when invocation load, progressive disclosure, completion,
leading words, or pruning decisions need precise definitions.

## Review Questions

Before treating a skill body as ready, ask:

- Does the description name the distinct branches that should invoke the skill without repeating
  synonyms for the same branch?
- Does each instruction change behavior relative to a capable model's default?
- Is each meaning owned in one place?
- Are must-follow rules visible on every path that needs them?
- Does each step end on a checkable and sufficiently demanding completion criterion?
- Are hard prohibitions reserved for real guardrails and paired with the positive target behavior?
- Would a shorter body preserve the same behavior more reliably?

For behavior-shaping skills, run the repository's temporary pressure-test workflow. For implicitly
invokable skills, validate positive and negative trigger behavior on every supported agent.

Stop when the skill's branches, protected behavior, information hierarchy, and completion criteria
are explicit, and the smallest relevant validation passes.
