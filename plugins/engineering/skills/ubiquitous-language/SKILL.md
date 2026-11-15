---
name: ubiquitous-language
description: >-
  Use when the session creates, updates, prunes, or reviews the ubiquitous language section of an
  AGENTS.md, which holds the project's domain terms, terminology, or glossary: defines a domain
  term, picks one canonical name among synonyms, records aliases to avoid, captures a term that
  stabilized during other work, or adapts a glossary into agent guidance. Do not use for other edits
  to an instruction file (writing:agent-instructions) or to rename code identifiers without a
  decision on the term.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/domain-modeling
  upstream_reviewed: 5863806dd4e15c63174bee4e7515a4256792ecfa
  upstream_divergence: >-
    the language lives in AGENTS.md sections, one per bounded context, not in GLOSSARY.md files;
    decision records belong to engineering:decision-records
---

# Ubiquitous language

The ubiquitous language of domain-driven design is the one vocabulary that the project's people,
agents, code, tests, and documents share. This skill maintains the written form of that language in
`AGENTS.md`, where every session loads it. From domain-driven design it takes the ubiquitous
language and the bounded context only; tactical patterns such as aggregates and entities are out of
scope.

## Outcome

`AGENTS.md ## Ubiquitous language` accurately captures stable domain terms, aliases to avoid, and
important relationships, or the user receives a focused review of the language with concrete
proposed changes.

## Evidence rules

- Read the existing `AGENTS.md ## Ubiquitous language` section before changing it. A section named
  `## Terminology` is the same section under its earlier name.
- Use repository evidence: conversation context, README files, nearby docs, code names, tests, and
  established maintainer language.
- State uncertainty when a term is not stable enough to make durable.
- Ground each term in maintainer, domain-expert, or user-facing language; implementation names on
  their own are corroborating evidence, not a source.
- Test important relationships, state transitions, and ownership boundaries with concrete edge-case
  scenarios instead of relying only on happy-path examples.
- When the user states how a concept behaves, verify the claim against relevant code and tests. If
  the language and the implementation disagree, surface the contradiction before updating either.

## Workflow

Run one mode per invocation, and read only that mode's reference; the rules in this file apply in
every mode. Review mode is the exception: when the user asks for the review's findings to be
applied, read [references/update.md](references/update.md) as well.

- If `AGENTS.md` has no ubiquitous language section and the user wants durable domain language, read
  [references/create.md](references/create.md).
- If the section exists and stable terms, aliases, ambiguities, or relationships have emerged, read
  [references/update.md](references/update.md).
- If the user asks whether the language is complete, consistent, or aligned with code and docs, read
  [references/review.md](references/review.md).

## Bounded contexts

A bounded context is the part of the project inside which each term has exactly one meaning. Each
`AGENTS.md` holds the language of one bounded context: the root file for the whole repository, and a
nested file for the directory it governs. A term anchors shared language only while its file is
loaded, so place each term in the context where the work that speaks it happens:

- Keep terms the whole repository speaks in the root `AGENTS.md`.
- If a term is spoken only while working under one directory, keep it in that directory's
  `AGENTS.md`.
- If a term is spoken only inside one workflow, leave it to that workflow's own documents and skip
  the entry.
- If one word means different things in two contexts, define it in each context's file, and do not
  force one definition onto both.
- If a term crosses contexts with one meaning, define it in the root file only.

Judge placement by where the work happens, not where the topic's files sit.

## Section structure

- Open the section with the usage contract in [references/create.md](references/create.md): the
  section is always loaded, so its opening lines are the only place that can tell a session outside
  this skill to speak the language and to point out a conflicting term.
- Write each term as one list item: `- **Term**: Definition. Aliases to avoid: alias, alias.` Omit
  the `Aliases to avoid:` clause when the term has none. The bold name first, the one-sentence
  definition, and the alias clause last make the entry correct. A table holds the same entries in
  more bytes, because formatters pad every column to its widest cell.
- Keep one list by default. Group terms under subheadings only when the domain is large enough that
  one list hurts scanability.
- Resolve each ambiguity with a canonical term, an alias to avoid, a sharper definition, or a
  relationship. Add a permanent "Flagged ambiguities" section only for an ambiguity the project
  intentionally leaves unresolved.

## Term rules

- A term earns its entry by resolving an ambiguity, canonicalizing an alias, or fixing a non-obvious
  relationship; skip terms no one confuses.
- Skip entries whose definition restates an always-loaded surface, such as an installed skill's
  description or another section of the same file; skip relationships that restate workflow behavior
  the owning skill or document already encodes.
- Skip generic programming concepts unless they have domain-specific meaning in the project.
- Define what the term is in the domain, not how the code implements it and not every behavior
  associated with it. When a path, key, or command helps a reader find the thing the term names, add
  it as one locating clause at the end of the definition sentence.
- Keep definitions to one sentence.
- Use bold term names in relationship bullets.
- Preserve established terms unless evidence shows they are wrong or misleading.
- When code names conflict with the language, recommend whether to rename the code, change the term,
  or defer the decision.
- When a term exists because of a recorded trade-off, cite the decision record in the term's
  relationship bullet, adding that bullet when the term has none.
