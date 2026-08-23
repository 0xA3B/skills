---
name: technical-writing
description: >-
  Use when writing, editing, or reviewing technical artifacts — README files, CONTRIBUTING and setup
  guides, runbooks, operational procedures, migration and upgrade guides, API reference prose,
  architecture and design documents, release notes, long-form docstrings, pull request descriptions,
  or issue and ticket descriptions — including making existing text clearer or easier for non-native
  English readers. Applies Diátaxis structure, STE-inspired wording, and Google developer style
  formatting. Do not use for files that instruct agents such as AGENTS.md, CLAUDE.md, or SKILL.md;
  for chat responses, commit messages, or code comments; or for conceptual questions about writing
  standards.
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

This file governs technical artifacts: documentation, runbooks, reference prose, release notes, pull
request descriptions, and issue descriptions. For these artifacts its rules override the `prose`
base style. Chat responses, including responses about these artifacts, stay governed by `prose`;
files that instruct agents belong to `agent-instructions`; commit messages follow the repository's
commit convention.

Also apply the `prose` skill's slop patterns to every artifact this file governs. This file restates
the sentence rules it shares with `prose`, so it stands alone when it loads without the base; where
the two files conflict on a sentence, this file wins.

The project's own style guide, templates, and neighboring-file conventions win over this file; apply
these rules inside whatever structure the project already uses. The wording rules are STE-inspired
defaults, not controlled language; the Preferences section states when to enforce its measurable
limits strictly.

## Before you write

1. Check for a project style guide, a documentation template, or an existing convention in
   neighboring files.
2. When you create a document, restructure one, or are unsure what kind of text you are writing,
   read [document-modes.md](references/document-modes.md) and pick one mode. Pull request and issue
   descriptions take every layer except Diátaxis; skip this step for them.
3. Decide whether the text is a **procedure** (the reader performs steps) or a **description** (the
   reader learns how something works). The preferred sentence limits differ.
4. When the target is a README, read [readme.md](references/readme.md) for the content model.
5. When creating a document or changing its headings, lists, tables, or layout, read
   [formatting.md](references/formatting.md). Sentence-level edits to existing prose need only this
   file.

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
- Prefer the shortest common word that carries one clear meaning. The table below gives examples.

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
- Do not use idioms or metaphors. They do not survive translation.

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

## Preferences

Apply these when they do not cost meaning or natural technical prose; the preserve-meaning rule at
the top of Rules wins over each of them. Enforce them as hard rules only when the project or the
user explicitly requires controlled language such as strict ASD-STE100.

- Use a maximum of about 20 words in an instruction sentence and about 25 in a descriptive sentence.
- Avoid the "-ing" form of a verb. A technical name that ends in "-ing" is fine, for example "a
  string" or "load balancing".
- Do not put more than three nouns together.
- Use the simple present, simple past, and simple future tenses.
- Use a vertical list when there are more than two conditions, steps, or items.
- Use a maximum of six sentences in a descriptive paragraph.
- Avoid contractions.

## Word replacements

| Do not use          | Use       |
| ------------------- | --------- |
| accomplish, perform | do        |
| approximately       | about     |
| assist              | help      |
| attempt             | try       |
| commence, initiate  | start     |
| in order to         | to        |
| in the event that   | if        |
| leverage            | use       |
| prior to            | before    |
| subsequent to       | after     |
| sufficient          | enough    |
| terminate           | stop      |
| utilize             | use       |
| verify              | make sure |

This table is a short set of examples, not a dictionary. When a word is not listed, choose the
shortest common word that carries one clear meaning.

## What these rules do not govern

Leave these alone. Reproduce them exactly.

- Code blocks, identifiers, file paths, commands, and configuration keys.
- Command output, log lines, and error messages.
- Names of tools, standards, APIs, and products.
- Quoted text from a person or a specification.

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
  rewrite. After a substantial rewrite of behavior-heavy prose, check the stated behavior against
  code, tests, or another authoritative source.
- The document serves one Diátaxis mode, with links where modes meet. A gateway README serves one
  mode per section; pull request and issue descriptions skip Diátaxis.
- Every sentence names its actor in the active voice, except where the actor is unknown or beside
  the point, and each instruction starts with a command verb after its condition.
- Each concept uses one term, and that term does not change across the document.
- Every warning appears before its step.
- No "only", pronoun, or "and"/"or" grouping can be read two ways.
- When the document's structure changed, it passes the checks in
  [formatting.md](references/formatting.md).

## Limits

You do not have the ASD-STE100 dictionary. It is a licensed document, so you cannot confirm that a
specific word is approved. Follow the rules above and use your best judgement. If the project
provides an STE checker and requires controlled language, use that checker as the final acceptance
gate.
