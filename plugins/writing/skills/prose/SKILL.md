---
name: prose
description: >-
  Use when asked to write, rewrite, tighten, shorten, or review general prose for a human reader — a
  chat reply, explanation, summary, announcement, email, newsletter, or blog post — or to make text
  sound less AI-generated, robotic, or stilted, or to cut filler and slop from text. This is the
  base style for all prose; skills for specific artifact classes override it for their artifacts. Do
  not use when the target is a technical artifact or a technical comment or reply in an issue or
  review thread, even if the user asks to rewrite, tighten, or improve its prose. Technical-writing
  owns that composition after the substance and disposition are settled; verifying, triaging, or
  deciding how to handle existing feedback belongs to the feedback-handling workflow. Also do not
  use for files that instruct agents (agent-instructions); for commit messages; for program code; or
  for conceptual questions about writing style.
license: MIT
metadata:
  original_author: Alex Baker
  patterns_adapted_from: https://github.com/cursor/plugins/tree/bc697d0a5a163cec979e362b601e36f5616083fd/pstack/skills/unslop
  upstream_reviewed: bc697d0a5a163cec979e362b601e36f5616083fd
  upstream_divergence: splits spliced sentences instead of banning em dashes and colons
---

# Prose

Every sentence spends the reader's attention. Filler, hedging, spliced clauses, inflated vocabulary,
and flourish spend it without paying anything back, and they are also the patterns that mark text as
machine-written. This file removes them.

## Scope and precedence

This file is the base style for all prose. When a more specific writing skill governs the text, its
rules override this file for that text: `technical-writing` for technical artifacts,
`agent-instructions` for files and prompts that instruct agents. Chat responses, including responses
about those artifacts, stay governed by this file plus
[chat-responses.md](references/chat-responses.md). Commit messages follow the repository's commit
convention.

Reproduce code, identifiers, file paths, commands, error messages, and quoted text exactly. They are
outside this style. Text the user supplies for rewriting is the editing target, not protected
quotation, even when it arrives in quotation marks or a block quote.

## Core rules

- Start with the point. The first sentence carries the claim the reader came for; support follows.
- Keep one main claim per sentence. Split a sentence when a dash, semicolon, or colon hides a
  separate point or makes the reader backtrack. Keep the punctuation when it preserves a useful
  relationship or natural rhythm without reducing clarity.
- Give each paragraph one idea, and start a new paragraph when the topic shifts. Within a paragraph,
  mix short and long sentences so the prose does not run as one dense block. A short sentence is
  still a whole sentence, not a fragment for effect.
- Use the active voice and name the actor: "the loader parses the file", not "the file is parsed".
  Passive voice is acceptable where the actor is unknown or beside the point.
- Choose the plain word: "use", not "utilize"; "help", not "facilitate". Keep the precise technical
  term when it is correct.
- Use one term per concept and repeat it exactly. Reaching for a synonym to vary the prose teaches
  the reader two things where there is one.
- Put the condition before the action, so the reader can skip what does not apply.
- Make every "it", "they", and "this" point at one obvious thing. Repeat the noun when in doubt.
- Be specific. Name the mechanism or the number: "a column rename fails the build", not "schema
  changes can cause issues". If a sentence could appear unchanged in another project's text, it says
  nothing about this one. Cut it.
- State an uncertainty once, concretely, near the claim it qualifies: "I did not run this" is
  useful; "this may not work" is not.
- When summarizing a document or discussion, restate it in your own words. Put any phrase copied
  from the source in quotation marks, and keep each quotation short.

## Patterns to remove

Scan for these, rewrite while preserving meaning, then reread once asking "what still reads as
machine-written?"

### Mannered prose

Mannered prose substitutes metaphor and flourish for direct statement: "a dial worth turning" where
"a parameter worth varying" would do, "this point earns its keep" where "this point still matters"
would do. The phrase displays the writer instead of conveying the idea, and it carries connotations
the writer did not choose. When a literal phrase is available, use it. Mannered prose takes these
forms:

- **Abstract metaphor nouns.** Landscape, tapestry, testament, paradigm, bedrock, nexus, north star,
  flywheel, journey. Pick the concrete word for what the sentence actually means.
- **Figurative verbs and personification.** "Rides along", "stands on", "the plan holds it". Say
  what happens and who does it.
- **Fancy ways to say "is".** "Serves as", "stands as", "acts as", "boasts", "features". Write "is"
  or "has".
- **Aphorisms and fragments for effect.** "Wire it or delete it." "Fast. Simple. Done." State the
  point as a whole sentence.

### Vocabulary

- **Inflated words.** Additionally, crucial, delve, enhance, foster, garner, intricate, leverage,
  pivotal, robust, seamless, showcase, underscore, utilize, vibrant. Replace with the plain word.
- **Adverbs propping up weak verbs.** "Runs quickly" becomes "is fast" or the number; "significantly
  improves" becomes the measured delta.
- **Invented compound labels.** A hyphenated coinage such as "exact-head checks" or "editorial-row
  layout" makes the reader decode a term nobody defined. State the relationship with plain verbs and
  prepositions: "checks that run against the exact head commit".

### Formulas

- **"Not just X, but Y" and "This isn't about X. It's about Y."** State the point directly.
- **Unprompted contrasts.** "X, not Y", where the reader never raised Y. State X. Keep a contrast
  that heads off a mistake the reader is likely to make.
- **Announced omissions.** Saying, unprompted, what you will not do or how you will sort the
  results. State what you do. Keep a statement that something is unchanged when the reader would
  otherwise assume it changed.
- **Rhetorical question and answer.** "The fix? A retry." becomes "A retry fixes it."
- **Rule of three.** Ideas forced into groups of three. Use the natural number.
- **False ranges.** "From X to Y" where X and Y are not on a scale. List the items directly.
- **Filler phrases.** "In order to" becomes "to"; "due to the fact that" becomes "because"; "it is
  important to note that" is deleted.
- **Hedging stacks.** "Could potentially possibly" becomes "may". State the one real uncertainty per
  the core rules.
- **Vague attribution.** "Experts believe", "industry reports suggest". Name the source or delete
  the claim.

### Formatting

- **Inline-header lists.** A bold label and colon that restate the line ("**Performance:**
  performance improved ...") become prose. A bold label that names the item, followed by new detail
  the label does not repeat, is fine.
- **Decoration.** Use a heading, table, or list when the content has that structure: separate
  sections, items with shared attributes, or parallel items. Do not bold every proper noun. No
  decorative emojis. Sentence-case headings.

### Ceremony

- **Chatbot phrases.** "I hope this helps", "Let me know if", "Great question", "You're absolutely
  right". Delete them and respond directly.
- **Restating and summarizing.** Do not restate the request, narrate the plan, or close by
  summarizing what was just written, including closers such as "In short:" or "Bottom line:".

## Chat responses

When writing or reviewing a chat response or conversational reply, apply
[chat-responses.md](references/chat-responses.md) on top of this file. It owns response shape,
layout, closing next steps, length calibration, and evidence conduct.

## Self-check

Read the finished text once and fix every hit: punctuation that hides a separate point or makes the
reader backtrack; a paragraph that carries two ideas or runs as one dense block; a mannered phrase
where a literal one is available; a word or formula from the patterns above; a hedge that does not
name what is uncertain; a sentence that could appear unchanged in someone else's text; structure
that decorates instead of organizes.
