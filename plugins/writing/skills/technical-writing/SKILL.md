---
name: technical-writing
description: >-
  Use whenever the session writes, edits, or reviews a technical artifact for other readers, even as
  a small edit or as one step of a larger task: a README, guide, runbook, knowledge-base page, API
  reference, design document, or release notes; a pull request, issue, or ticket description; or a
  comment or reply in an issue or review thread. This includes a draft to publish later and text
  made clearer for non-native English readers. Do not use to review documentation changed in this
  checkout (engineering:review-changes); to decide what unresolved review feedback requires
  (engineering:receiving-feedback); for decision records (engineering:decision-records); for files
  that instruct agents (agent-instructions); for code comments; or for scratch notes nobody will
  publish.
license: MIT
metadata:
  original_author: Alex Baker
  layers_adapted_from: https://github.com/cursor/plugins/tree/46125561306434d8a1d7745d540d8932ab0cd2a2/pstack/skills/technical-writing
  upstream_reviewed: 2eaf46574b25cdf7ef8c849837099b866b7438ce
  change_descriptions_adapted_from: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/pr
  change_descriptions_upstream_reviewed: 4ae2317ddb22b046e26455e4f9c9b3aaaf62212d
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

When the `prose` skill is available, load it and apply its "Patterns to remove" section to every
artifact this file governs.

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
5. When you create, split, merge, restructure, or review the pages of a wiki, knowledge base,
   documentation portal, or other multi-page documentation set, read
   [knowledge-bases.md](references/knowledge-bases.md) before choosing pages: it governs the page
   set, the publishing representation, executable examples, and the rendered review. For an edit to
   one existing page other than the gateway that keeps the page's audience and reader task and adds,
   changes, removes, or moves no mutable fact, read only the publishing-representation,
   executable-examples, and rendered-review sections of that reference.
6. When writing or revising a pull request or merge request description, read
   [change-descriptions.md](references/change-descriptions.md).
7. When creating a document, changing its headings, lists, tables, or layout, or reviewing its
   layout or rendering, read [formatting.md](references/formatting.md). Sentence-level edits to
   existing prose need only this file.
8. When writing or revising a Jira or issue comment, pull request or merge request comment, or a
   reply in a review thread, read [collaborative-comments.md](references/collaborative-comments.md).
9. When the user or project requires strict controlled language or translation-oriented writing,
   read [controlled-language.md](references/controlled-language.md).

## Rules

Preserve technical meaning, conditions, exceptions, and executable detail before applying any
wording rule below. When a wording rule makes a sentence less precise, or shortening or splitting a
sentence obscures behavior or a relationship between facts, fix the sentence another way or leave it
alone.

### Words

- Use one word for each meaning and one meaning for each word: repeat the same word for a concept,
  and do not reuse it for a different concept.
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
- Put a warning or a caution before the step it applies to, and start it with a command. Write "Do
  not run this against production."

### Paragraphs

- Put the topic sentence first in the paragraph.
- Split separate ideas into separate sentences. Keep a longer sentence that carries one idea with
  its condition or consequence.

## What these rules do not govern

Reproduce these exactly:

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
- Every sentence you wrote or changed follows each rule under "Rules".
- A created or restructured document has one dominant mode, as
  [document-modes.md](references/document-modes.md) defines it.
- When the document's structure changed, it follows [formatting.md](references/formatting.md).
