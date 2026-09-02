---
name: technical-writing
description: >-
  Use when writing, editing, or reviewing technical artifacts — README files, CONTRIBUTING and setup
  guides, runbooks, operational procedures, migration and upgrade guides, API reference prose,
  architecture and design documents, release notes, long-form docstrings, pull request descriptions,
  or issue and ticket descriptions — including making existing text clearer or easier for non-native
  English readers. Do not use to assess, triage, or decide changes from unresolved review feedback.
  Once another workflow settles the feedback, use for drafting or rewriting technical comments in
  Jira and other issue trackers, pull request or merge request comments, and reviewer replies.
  Applies Diátaxis structure, STE-inspired wording, and Google developer style formatting. Do not
  use for files that instruct agents such as AGENTS.md, CLAUDE.md, or SKILL.md; for chat responses,
  commit messages, or code comments; or for conceptual questions about writing standards.
license: MIT
metadata:
  original_author: Alex Baker
  layers_adapted_from: https://github.com/cursor/plugins/tree/46125561306434d8a1d7745d540d8932ab0cd2a2/pstack/skills/technical-writing
  upstream_reviewed: 46125561306434d8a1d7745d540d8932ab0cd2a2
---

# Technical writing

A technical artifact is read many times by readers who cannot ask a follow-up question, and an
ambiguous sentence costs each of them an experiment to resolve. Three layers split the work:
Diátaxis picks the document mode ([document-modes.md](references/document-modes.md)), the wording
rules in this file make each sentence load one way, and Google developer style governs formatting
and layout ([formatting.md](references/formatting.md)).

## Scope and precedence

This file governs technical artifacts: documentation, runbooks, reference prose, release notes,
change descriptions, issue and ticket descriptions, and collaborative technical comments. For these
artifacts its rules override the `prose` base style. Chat responses, including responses about these
artifacts, stay governed by `prose`; files that instruct agents belong to `agent-instructions`;
commit messages follow the repository's commit convention.

For a collaborative comment, start after its technical substance and disposition are settled.
Verifying, triaging, or deciding how to handle existing feedback is outside this skill's scope.

Also apply the `prose` skill's slop patterns to every artifact this file governs. This file restates
the sentence rules it shares with `prose`, so it stands alone when it loads without the base; where
the two files conflict on a sentence, this file wins.

The project's own style guide, templates, and neighboring-file conventions win over this file. When
editing an existing artifact, make the smallest change that satisfies the request, preserve its
established voice, and leave unrelated prose alone. The wording rules are STE-inspired defaults, not
controlled language.

## Before you write

1. Check for a project style guide, a documentation template, or an existing convention in
   neighboring files.
2. When you create a document, restructure one, or are unsure what kind of text you are writing,
   read [document-modes.md](references/document-modes.md) and choose its dominant mode. Change
   descriptions, issue and ticket descriptions, and collaborative comments take every layer except
   Diátaxis; skip this step for them.
3. Decide whether the text is a **procedure** (the reader performs steps) or a **description** (the
   reader learns how something works). Their structure and ordering rules differ.
4. When the target is a README, read [readme.md](references/readme.md) for the content model.
5. When writing or revising a pull request or merge request description, read
   [change-descriptions.md](references/change-descriptions.md).
6. When creating a document or changing its headings, lists, tables, or layout, read
   [formatting.md](references/formatting.md). Sentence-level edits to existing prose need only this
   file.
7. When writing or revising a Jira or issue comment, pull request or merge request comment, or a
   reply in a review thread, read [collaborative-comments.md](references/collaborative-comments.md).
8. When the user or project requires strict controlled language or translation-oriented writing,
   read [controlled-language.md](references/controlled-language.md).

## Rules

**Preserve technical meaning, conditions, exceptions, and executable detail before applying any
wording rule below. Do not shorten or split a sentence when the change obscures behavior or a
relationship between facts.** When a wording rule makes a sentence less precise, fix the sentence
another way or leave it alone.

### Words

- Use one word for one meaning. Use the same word for that meaning each time.
- Use one meaning for one word. Do not use a word as a synonym for a different concept.
- Technical names and technical verbs are permitted and expected. Write "cache", "deserialize",
  "idempotent", and "quorum" when they are correct. These rules remove vague words, not precise
  ones.
- Write the full term before you use its abbreviation.
- Prefer the shortest common word that preserves the exact meaning: "before" rather than "prior to",
  and "use" rather than "utilize".

### Verbs

- Use the active voice. Name the actor: "the compiler checks", not "is checked". Passive voice is
  acceptable only when the actor is unknown or beside the point.
- Use "must" for a requirement. Use "can" for a possibility. Do not use "shall" or "should" for a
  requirement.

### Ambiguity

- Keep "only" and "not" next to the word they change: "only fails on growth" and "fails only on
  growth" say different things.
- Make every "it", "they", and "this" point at one obvious thing. Repeat the noun when in doubt. Do
  not point "this" or "which" at a whole clause.
- Break a noun cluster that can be read two ways with a preposition: "the timeout for the connection
  pool", not "the connection pool timeout value".
- Keep articles and the small words that make a sentence parse one way: "Open the file", not "Open
  file"; "make sure that the switch is off" keeps "that".
- Say which parts "and" or "or" joins when a sentence can group two ways. "Both ... and", "either
  ... or", and "if ... then" are free disambiguators.
- Do not use a slash to show an alternative, and do not form plurals with "(s)". Write "a, b, or
  both".
- Do not put necessary information in parentheses.
- Avoid decorative idioms and metaphors that require cultural interpretation. Keep established
  technical terms and defined domain language when they are the clearest precise terms.

### Procedures

- Give one instruction in one sentence. Two actions that occur at the same time can share a
  sentence.
- Start each instruction with the command verb.
- Put the condition before the command. Write "If the build fails, examine the log."
- State prerequisites before the command that needs them.
- Put a warning or a caution before the step it applies to, never after, and start it with a
  command. Write "Do not run this against production."

### Paragraphs

- Put the topic sentence first in the paragraph.
- Split genuinely separate ideas into separate sentences. Keep a longer sentence that carries one
  idea with its condition or consequence.

## What these rules do not govern

Leave these alone. Reproduce them exactly.

- Code blocks, identifiers, file paths, commands, and configuration keys.
- Command output, log lines, and error messages.
- Names of tools, standards, APIs, and products.
- Quoted text from a person or a specification.

Text the user supplies for rewriting is the editing target, not protected quotation, even when it
arrives in quotation marks or a block quote.

## Example

Before:

> Prior to attempting a migration, you'll want to make sure you've got a recent backup — the
> migration tooling is doing a lot of in-place rewriting, and recovering from a failed run without
> one can be pretty painful.

After:

> WARNING: Make a backup before you start the migration. The migration tool rewrites the data in
> place. You cannot recover from a failed migration without a backup.
>
> To start the migration, run `db-migrate up`.

## Checklist

Read the finished text once and check each item:

- Every condition, threshold, exception, and edge case in the source material survives in the
  rewrite.
- After a substantial rewrite of behavior-heavy prose, run each practical check:
  - Check commands against help or task definitions.
  - Check defaults against code or schemas.
  - Check paths and links against the repository.
  - Check examples and behavior claims against tests or executable behavior.
- The document has one dominant Diátaxis mode. Use clearly separated sections for other modes when
  they serve the same audience and lifecycle; change descriptions, issue and ticket descriptions,
  and collaborative comments skip Diátaxis.
- Every sentence names its actor in the active voice, except where the actor is unknown or beside
  the point, and each instruction starts with a command verb after its condition.
- Each concept uses one term, and that term does not change across the document.
- Every warning appears before its step.
- No "only", pronoun, or "and"/"or" grouping can be read two ways.
- When the document's structure changed, it passes the checks in
  [formatting.md](references/formatting.md).
