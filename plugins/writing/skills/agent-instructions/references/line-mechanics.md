# Line mechanics

Mechanics for the lines inside a document agents consume: completion criteria, formatting, leading
words, and pruning. Read this file when writing a workflow's steps, choosing the form of a list,
table, heading, or command block, anchoring a repeated concept, or sweeping a document for lines to
cut. The sentence-level rules live in `SKILL.md`, and [document-mechanics.md](document-mechanics.md)
owns the decisions about documents; this file owns the lines inside them.

## Completion criteria

Two properties make a completion criterion a lever:

- **Clarity** — can the agent tell done from not-done? A vague criterion ("understanding reached")
  invites **premature completion**: ending the step early because the visible later steps pull
  attention forward. Sharpen the criterion first — a local, cheap edit. Splitting the sequence is
  the second defense, under "Splitting" in [document-mechanics.md](document-mechanics.md).
- **Demand** — how much the criterion requires. Demand is not step-bound: "every rule applied" binds
  a body of flat reference the same way "every step done" binds a sequence, which is how an
  all-reference document still carries an exhaustiveness bar.

The strongest criteria are both checkable and exhaustive.

## Formatting

Form carries meaning for an agent; choose the form that encodes the intent:

- Use a numbered list only when order matters. A numbered list reads as a sequence to execute; a
  bulleted list reads as rules that all apply.
- Keep list items parallel in structure; the model continues the pattern it sees.
- Use sentence case in headings and do not skip heading levels — the same heading convention the
  sibling technical-writing skill applies to human-facing artifacts, so both file families read
  alike.
- Use a table only for rows that share the same attributes; keep cells short and put explanation in
  prose.
- Make every command block run as pasted: mark placeholders in one consistent form and define each
  near its first use. The agent executes commands verbatim.
- Write timeless text. "Currently", "new", and references to the change that introduced a rule are
  sediment the moment they land.

## Leading words

A leading word, repeated as a token and never as a sentence, anchors a region of behavior in the
fewest tokens by recruiting priors the model already holds. A coined word recruits no priors — you
pay in definition tokens what a pretrained word gives free; reach for an existing word first.

A leading word anchors twice. In the body, execution: the agent reaches for the same behavior every
time the word appears. In a pointer, invocation: when the same word lives in your prompts, your
documents, and your codebase, the agent links the shared language to the material and reaches it
more reliably.

Hunt for passages a leading word can retire: a triad spelled out at three sites ("fast,
deterministic, low-overhead" → a _tight_ loop), a fuzzy gate that becomes a binary state ("a loop
you believe in" → the loop goes _red_ on the bug, or it does not).

## Pruning

- Check every line for **relevance**: does it still bear on what the document does? A line loses
  relevance by never bearing on the task or by going stale as the world changes. Without a pruning
  discipline the default fate is **sediment**: stale layers that settle because adding feels safe
  and removing feels risky.
- Hunt **no-ops** sentence by sentence: an instruction the model already obeys by default pays load
  to say nothing. The test — does it move behavior from the default toward the target? — is
  model-relative: two people disagreeing about a no-op disagree about the default, and settle it by
  running the document, not by debate. When a sentence fails, delete the whole sentence.
- The exception is an **anchor rule**, as "What not to optimize or remove" in `SKILL.md` defines it.
