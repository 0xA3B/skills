---
name: documentation
description: >-
  Use when writing, editing, or reviewing human-facing project documentation — README files,
  CONTRIBUTING and setup guides, runbooks, operational procedures, migration and upgrade guides, API
  reference prose, architecture documents, release notes, or long-form docstrings — including making
  existing documentation clearer or easier for non-native English readers. Applies Simplified
  Technical English to wording and sentence structure and Google developer style to formatting and
  layout. Do not use for files that instruct agents such as AGENTS.md, CLAUDE.md, or SKILL.md; for
  chat responses, commit messages, pull request descriptions, or code comments; or for conceptual
  questions about documentation standards.
license: MIT
metadata:
  original_author: Alex Baker
user-invocable: false
---

# Documentation

A document is read many times by readers who cannot ask a follow-up question, and an ambiguous
sentence costs each of them an experiment to resolve. Two standards split the work: ASD-STE100
Simplified Technical English (STE) owns words and sentences — the rules in this file — and the
Google developer documentation style guide informs formatting and layout, distilled in
[formatting.md](references/formatting.md).

Precedence: the project's own style guide, templates, and neighboring-file conventions win; apply
these rules inside whatever structure the project already uses. When a wording rule in this file and
a formatting rule conflict on the same sentence, this file wins.

## Before you write

1. Check for a project style guide, a documentation template, or an existing convention in
   neighboring files.
2. Decide whether the text is a **procedure** (the reader performs steps) or a **description** (the
   reader learns how something works). The sentence limits differ.
3. When the target is a README, read [readme.md](references/readme.md) for the content model.
4. When creating a document or changing its headings, lists, tables, or layout, read
   [formatting.md](references/formatting.md). Sentence-level edits to existing prose need only this
   file.

## Rules

### Words

- Use one word for one meaning. Use the same word for that meaning each time.
- Use one meaning for one word. Do not use a word as a synonym for a different approved word.
- Use each word in one part of speech. Write "Lubricate the bearing with oil." Do not write "Oil the
  bearing."
- Technical names and technical verbs are permitted and expected. Write "cache", "deserialize",
  "idempotent", and "quorum" when they are correct. STE removes vague words, not precise ones.
- Write the full term before you use its abbreviation.

### Noun phrases

- Do not put more than three nouns together. Break the cluster with a preposition. Write "the
  timeout for the connection pool". Do not write "the connection pool timeout value".
- Do not remove articles to shorten a sentence. Write "Open the file."

### Verbs

- Use the active voice.
- Use the simple present, simple past, and simple future tenses only.
- Do not use the "-ing" form of a verb. A technical name that ends in "-ing" is permitted, for
  example "a string" or "load balancing".
- Use "must" for a requirement. Use "can" for a possibility. Do not use "shall" or "should" for a
  requirement.

### Sentences and paragraphs

- Use a maximum of 20 words in an instruction sentence.
- Use a maximum of 25 words in a descriptive sentence.
- Give one instruction in one sentence. Two actions that occur at the same time can share a
  sentence.
- Use a maximum of six sentences in a descriptive paragraph.
- Put the topic sentence first in the paragraph.
- Use a vertical list when there are more than two conditions, steps, or items.

### Procedures

- Start each instruction with the command verb.
- Put the condition before the command. Write "If the build fails, examine the log."

### Warnings and cautions

- Put a warning or a caution before the step it applies to, never after.
- Start a warning with a command. Write "Do not run this against production."

### Punctuation

- Do not use a slash to show an alternative. Write "and" or "or".
- Do not put necessary information in parentheses.
- Do not use contractions. Write "do not", not "don't".
- Do not use idioms, metaphors, or humor. They do not survive translation.

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

This table is a short set of examples, not the STE dictionary. When a word is not listed, choose the
shortest common word that carries one clear meaning.

## What these rules do not govern

Leave these alone. Reproduce them exactly.

- Code blocks, identifiers, file paths, commands, and configuration keys.
- Command output, log lines, and error messages.
- Names of tools, standards, APIs, and products.
- Quoted text from a person or a specification.

## Example

Not STE:

> Prior to attempting a migration, you'll want to make sure you've got a recent backup — the
> migration tooling is doing a lot of in-place rewriting, and recovering from a failed run without
> one can be pretty painful.

STE:

> WARNING: Make a backup before you start the migration. The migration tool rewrites the data in
> place. You cannot recover from a failed migration without a backup.
>
> To start the migration, run `db-migrate up`.

## Checklist

Read the finished text once and check each item:

- Every sentence uses the active voice.
- No sentence is longer than the limit for its type.
- Each instruction sentence starts with a command verb.
- No "-ing" verb forms remain, except in technical names.
- Each concept uses one term, and that term does not change across the document.
- Every warning appears before its step.
- When the document's structure changed, it passes the checks in
  [formatting.md](references/formatting.md).

## Limits

You do not have the ASD-STE100 dictionary. It is a licensed document, so you cannot confirm that a
specific word is approved. Follow the rules above and use your best judgement. If the project
provides an STE checker, then use that as the final acceptance gate.
