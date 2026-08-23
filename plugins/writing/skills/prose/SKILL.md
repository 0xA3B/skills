---
name: prose
description: >-
  Use when asked to write, rewrite, tighten, shorten, or review prose for a human reader — a chat
  reply, explanation, summary, announcement, email, newsletter, or blog post — or to make text sound
  less AI-generated, robotic, or stilted, or to cut filler and slop from text. This is the base
  style for all prose; skills for specific artifact classes override it for their artifacts. Do not
  use for technical artifacts such as READMEs, runbooks, or pull request descriptions
  (technical-writing); for files that instruct agents (agent-instructions); for commit messages; for
  program code; or for conceptual questions about writing style.
license: MIT
metadata:
  original_author: Alex Baker
  patterns_adapted_from: https://github.com/cursor/plugins/tree/46125561306434d8a1d7745d540d8932ab0cd2a2/pstack/skills/unslop
  upstream_reviewed: 46125561306434d8a1d7745d540d8932ab0cd2a2
---

# Prose

Every sentence spends the reader's attention. Filler, hedging, spliced clauses, and inflated
vocabulary spend it without paying anything back, and they are also the patterns that mark text as
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
- Make each sentence one claim. When a dash, semicolon, or colon introduces a second claim, promote
  it to its own sentence or delete it. These marks may join a claim to its list, its example, or a
  short aside, not to another claim.
- Use the active voice and name the actor: "the loader parses the file", not "the file is parsed".
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

## Slop patterns

Scan for these, rewrite while preserving meaning, then reread once asking "what still reads as
machine-written?"

### Vocabulary

- **Inflated words.** Additionally, crucial, delve, enhance, foster, garner, intricate, leverage,
  pivotal, robust, seamless, showcase, underscore, utilize, vibrant. Replace with the plain word.
- **Fancy ways to say "is".** "Serves as", "stands as", "acts as", "boasts", "features". Write "is"
  or "has".
- **Abstract metaphor nouns.** Landscape, tapestry, testament, paradigm, bedrock, nexus, north star,
  flywheel, journey. Pick the concrete word for what the sentence actually means.
- **Adverbs propping up weak verbs.** "Runs quickly" becomes "is fast" or the number; "significantly
  improves" becomes the measured delta.

### Formulas

- **"Not just X, but Y."** State the point directly.
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
  performance improved ...") become prose. A bold lead-in followed by genuinely new detail is fine.
- **Decoration.** Use headers, tables, and bullet lists only when they carry real structure. Do not
  bold every proper noun. No decorative emojis. Sentence-case headings.

### Ceremony

- **Chatbot phrases.** "I hope this helps", "Let me know if", "Great question", "You're absolutely
  right". Delete them and respond directly.
- **Restating and summarizing.** Do not restate the request, narrate the plan, or close by
  summarizing what was just written.

## Chat responses

When writing or reviewing a chat response or conversational reply, apply
[chat-responses.md](references/chat-responses.md) on top of this file. It owns response shape,
length calibration, and evidence conduct.

## Self-check

Read the finished text once and fix every hit: a sentence carrying a second claim after a dash,
colon, or semicolon; a word from the slop patterns; a hedge that does not name what is uncertain; a
sentence that could appear unchanged in someone else's text; structure that decorates instead of
organizes.
