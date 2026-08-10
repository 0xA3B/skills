---
name: terminology
description: >-
  Create, update, prune, or review durable project terminology in AGENTS.md. Use when the user wants
  to define domain terms, harden naming, resolve ambiguous language, record aliases to avoid, align
  code or docs with a terminology section, capture a term that stabilized during review or
  implementation, or adapt glossary/ubiquitous-language guidance into repository agent guidance. Do
  not use for general instruction-file style or structure editing, for renaming code identifiers
  without a terminology decision, or for conceptual questions about terminology or domain language.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/aaf2453fbdfe7a15c07f11d861224f34ab4b53cb/skills/deprecated/ubiquitous-language
---

# Terminology

Treat terminology as agent-facing guidance that should be useful in future sessions, not as a
standalone domain-modeling artifact.

## Outcome

`AGENTS.md ## Terminology` accurately captures stable domain terms, aliases to avoid, and important
relationships, or the user receives a focused terminology review with concrete proposed changes.

## Evidence Rules

- Read the existing `AGENTS.md ## Terminology` section before changing it.
- Use repository evidence: conversation context, README files, nearby docs, code names, tests, and
  established maintainer language.
- Prefer the canonical term used by domain experts or project maintainers.
- State uncertainty when a term is not stable enough to make durable.
- Ground each term in maintainer, domain-expert, or user-facing language; implementation names on
  their own are corroborating evidence, not a source.
- Test important relationships, state transitions, and ownership boundaries with concrete edge-case
  scenarios instead of relying only on happy-path examples.
- When the user states how a concept behaves, verify the claim against relevant code and tests. If
  durable language and implementation disagree, surface the contradiction before updating either.

## Workflow

Run one mode per invocation, and read only that mode's reference; the rules in this file apply in
every mode. Review mode is the exception: when the user asks for the review's findings to be
applied, read [references/update.md](references/update.md) as well.

- If `AGENTS.md` has no terminology section and the user wants durable domain language, read
  [references/create.md](references/create.md).
- If the section exists and stable terms, aliases, ambiguities, or relationships have emerged, read
  [references/update.md](references/update.md).
- If the user asks whether terminology is complete, consistent, or aligned with code and docs, read
  [references/review.md](references/review.md).

## Placement

A term anchors shared language only while its file is loaded, so place each term at the scope where
the work that speaks it happens:

- Keep terms the whole repository speaks in the root `AGENTS.md`.
- If a term is spoken only while working under one directory, keep it in that directory's
  `AGENTS.md`.
- If a term is spoken only inside one workflow, leave it to that workflow's own documents and skip
  the table entry.

Judge placement by where the work happens, not where the topic's files sit.

## Section Structure

- Keep one table by default. Use grouped tables only when the domain is large enough that one table
  hurts scanability.
- Resolve each ambiguity with a canonical term, an alias to avoid, a sharper definition, or a
  relationship. Add a permanent "Flagged ambiguities" section only for an ambiguity the project
  intentionally leaves unresolved.

## Term Rules

- A term earns its row by resolving an ambiguity, canonicalizing an alias, or fixing a non-obvious
  relationship; skip terms no one confuses.
- Skip entries whose definition restates an always-loaded surface, such as an installed skill's
  description or another section of the same file; skip relationships that restate workflow behavior
  the owning skill or document already encodes.
- Include only terms relevant to domain experts, maintainers, or future agents working in the
  repository.
- Skip generic programming concepts unless they have domain-specific meaning in the project.
- Define what the term is, not every behavior associated with it.
- Keep definitions to one sentence.
- Use bold term names in relationship bullets.
- Preserve established terms unless evidence shows they are wrong or misleading.
- When code names conflict with durable terminology, recommend whether to rename code, update
  terminology, or defer the decision.
