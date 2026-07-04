---
name: terminology
description: >-
  Create, update, or review durable project terminology in AGENTS.md. Use when the user wants to
  define domain terms, harden naming, resolve ambiguous language, align code or docs with a
  terminology section, review aliases to avoid, or adapt glossary/ubiquitous-language guidance into
  repository agent guidance.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/aaf2453fbdfe7a15c07f11d861224f34ab4b53cb/skills/deprecated/ubiquitous-language
disable-model-invocation: true
---

# Terminology

Create, update, or review the project's durable domain language. Treat terminology as agent-facing
guidance that should be useful in future sessions, not as a standalone DDD artifact.

## Outcome

`AGENTS.md ## Terminology` accurately captures stable domain terms, aliases to avoid, and important
relationships, or the user receives a focused terminology review with concrete proposed changes.

## Evidence Rules

- Read the existing `AGENTS.md ## Terminology` section before changing it.
- Use repository evidence: conversation context, README files, nearby docs, code names, tests, and
  established maintainer language.
- Prefer the canonical term used by domain experts or project maintainers.
- State uncertainty when a term is not stable enough to make durable.
- Do not invent domain language from implementation details alone.

## Workflow

Choose the mode that matches the request.

### Create

Use when `AGENTS.md` has no terminology section and the user wants durable domain language.

1. Identify stable domain concepts from the conversation and repository evidence.
2. Add `## Terminology` to `AGENTS.md`.
3. Include the standard maintenance guidance, a terms table, and relationships when useful.
4. Keep the first version small; defer uncertain or contested terms.

### Update

Use when stable terms, aliases, ambiguities, or relationships have emerged.

1. Compare the proposed language with existing terminology.
2. Add or revise only terms that are stable enough to guide future work.
3. Resolve synonyms by choosing one canonical term and listing aliases to avoid.
4. Resolve overloaded words by splitting concepts or flagging the ambiguity in the relevant
   definition.
5. Update relationships when they clarify ownership, lifecycle, or cardinality.

### Review

Use when the user asks whether terminology is complete, consistent, or aligned with code and docs.

1. Inspect `AGENTS.md`, README files, nearby docs, code names, and tests relevant to the request.
2. Find missing, vague, overloaded, contradictory, or stale terms.
3. Report findings with file references and concrete wording changes.
4. Edit `AGENTS.md` only when the user asked for changes or clearly wants the review applied.

## Section Format

Use this structure in `AGENTS.md`:

```md
## Terminology

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

When maintaining the terminology:

- Prefer the canonical term used by domain experts or project maintainers.
- Define what the term is in one tight sentence.
- List aliases to avoid when multiple words could refer to the same concept.
- Flag ambiguous words when the same word is used for different concepts.
- Include relationships between terms when they clarify ownership, lifecycle, or cardinality.
- Skip generic programming terms and incidental class, function, or module names unless they are
  part of the domain language.

| Term        | Definition                                     | Aliases to Avoid |
| ----------- | ---------------------------------------------- | ---------------- |
| **Example** | A stable domain concept in one tight sentence. | stale alias      |

Relationships:

- An **Example** owns zero or more **Related Examples**.
```

Keep one table by default. Use grouped tables only when the domain is large enough that one table
hurts scanability. Avoid a permanent "Flagged ambiguities" section unless an ambiguity is
intentionally unresolved; otherwise resolve it through canonical terms, aliases to avoid,
definitions, or relationships.

## Term Rules

- Include only terms relevant to domain experts, maintainers, or future agents working in the
  repository.
- Skip generic programming concepts unless they have domain-specific meaning in the project.
- Define what the term is, not every behavior associated with it.
- Keep definitions to one sentence.
- Use bold term names in relationship bullets.
- Preserve established terms unless evidence shows they are wrong or misleading.
- When code names conflict with durable terminology, recommend whether to rename code, update
  terminology, or defer the decision.

## Final Response

End with:

- Terms added, changed, or intentionally deferred.
- Ambiguities resolved or still open.
- Any files updated, or review findings if no edit was made.
- Validation run when files changed.

Stop when the terminology section is updated or the review identifies the next terminology decision
the user needs to make.
