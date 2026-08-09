# Document mechanics

Structural mechanics for documents agents consume. Read this file when creating a document,
splitting or merging documents, moving material between files, or deciding what stays always-loaded.
The sentence-level rules live in `SKILL.md`; this file owns the decisions above the sentence.

## The two loads

Every document and pointer spends one of two budgets:

- **Context load** — the cost of always-loaded material on the agent's window: an `AGENTS.md` line,
  a skill description, anything in context every turn, spending tokens and attention whether or not
  it fires.
- **Cognitive load** — the cost on the human: which documents exist and when to reach for each. The
  human is the index. Cognitive load is not a cost to minimize — it is the price of human agency.
  Spend it where human judgment matters; remove it where it does not.

Material reached only through a pointer escapes context load at the price of the pointer's own line.
Material with no pointer at all rides entirely on cognitive load.

## Context pointers

A **context pointer** is wording held in context that names out-of-context material and states when
to read it. A skill description is one; a line in `AGENTS.md` naming a document is the same object.
The pointer's wording, not its target, decides when the agent reaches the material — and how
reliably. A must-read target behind a weakly worded pointer is a variance bug: sharpen the wording
first, and inline the material only if sharpening fails.

A pointer does two jobs: state what the material is, and list the **branches** that should trigger
reading it (a branch is a distinct case the document handles, so different runs take different paths
through it). An always-loaded pointer earns harder pruning than the body it points to:

- Front-load the leading word; the pointer is where it does its triggering work.
- Keep one trigger per branch. Synonyms that rename a single branch are one branch written twice;
  collapse them.
- Cut identity the body already carries.

## Information hierarchy

A document mixes two content types — **steps** (the ordered actions the agent performs) and
**reference** (definitions, rules, and facts consulted on demand). Place each piece on a ladder
ranked by how immediately the agent needs it:

1. **In-file step** — the primary tier: what the agent does, in order.
2. **In-file reference** — consulted on demand. A flat peer set (every rule of a review on one rung)
   is a fine arrangement, not a smell.
3. **Disclosed reference** — a separate file reached through a context pointer, loaded only when the
   pointer fires.

Push too little down and the top bloats; push too much and needed material hides. Branching is the
cleanest test: inline what every branch needs, and disclose what only some branches reach. When a
document has steps, in-file reference that should be disclosed buries them and makes attending to
them a coin flip.

**Co-location** decides what sits beside a piece once its rung is chosen: keep a concept's
definition, rules, and caveats under one heading, so reading one part brings its neighbors.
Scattering fragments one meaning across many places; duplication repeats one meaning in two places —
different failures, same cure in a one-home-per-meaning pass.

**Sprawl** is a document too long even when every line is live and unique. Attention thins across
the excess. Cure sprawl with the ladder: disclose reference behind pointers, and split by branch or
sequence so each path carries only what it needs.

## Completion criteria

Every step ends on a **completion criterion** — the condition that tells the agent the work is done.
Two properties make it a lever:

- **Clarity** — can the agent tell done from not-done? A vague bound ("understanding reached")
  invites **premature completion**: ending the step early because the visible later steps pull
  attention forward. Defend in order: sharpen the bound first — a local, cheap edit. Only when the
  bound is irreducibly fuzzy and you observe the rush, split the sequence so the later steps leave
  context. Hiding works only across a real context boundary (a hand off or a subagent dispatch); an
  inline reference leaves the later steps in context and clears nothing.
- **Demand** — how much the criterion requires. "Every modified model accounted for" forces thorough
  digging where "produce a change list" does not. Demand is not step-bound: "every rule applied"
  binds a body of flat reference the same way "every step done" binds a sequence, which is how an
  all-reference document still carries an exhaustiveness bar.

The strongest criteria are both checkable and exhaustive.

## Splitting

Splitting one document into two spends one of the two loads, so split only when the cut earns it:

- **By sequence** — split a run of steps where the visible later steps tempt the agent to rush the
  current one. Merging sequences has the reverse cost: it exposes each step to what follows.
- **By invocation** — skill-specific; see [skill-mechanics.md](skill-mechanics.md).

## Formatting

Form carries meaning for an agent; choose the form that encodes the intent:

- Use a numbered list only when order matters. A numbered list reads as a sequence to execute; a
  bulleted list reads as rules that all apply.
- Keep list items parallel in structure; the model continues the pattern it sees.
- Use sentence case in headings and do not skip heading levels — the same heading convention the
  sibling documentation skill applies to human-facing docs, so both file families read alike.
- Use a table only for rows that share the same attributes; keep cells short and put explanation in
  prose.
- Make every command block run as pasted: mark placeholders in one consistent form and define each
  near its first use. The agent executes commands verbatim.
- Write timeless text. "Currently", "new", and references to the change that introduced a rule are
  sediment the moment they land.

## Leading words

A **leading word** is a compact concept already in the model's priors that the agent thinks with
while running the document (_tracer bullet_, _frontier_, _tight loop_). Repeated as a token, never
as a sentence, it anchors a region of behavior in the fewest tokens by recruiting priors the model
already holds. A coined word recruits no priors — you pay in definition tokens what a pretrained
word gives free; reach for an existing word first.

A leading word anchors twice. In the body, execution: the agent reaches for the same behavior every
time the word appears. In a pointer, invocation: when the same word lives in your prompts, your
documents, and your codebase, the agent links the shared language to the material and reaches it
more reliably.

Hunt for passages a leading word can retire: a triad spelled out at three sites ("fast,
deterministic, low-overhead" → a _tight_ loop), a fuzzy gate that becomes a binary state ("a loop
you believe in" → the loop goes _red_ on the bug, or it does not).

**Negation** is the failure mode beside this lever: steering by prohibition drags the forbidden
behavior into context and makes it more available, not less. State the positive target so the banned
behavior is never spoken. A prohibition earns its place only as a hard guardrail you cannot phrase
positively — and even then, pair it with the positive target.

## Pruning

- Keep each meaning in a **single source of truth**: one authoritative home, so changing the
  behavior is a one-place edit. **Duplication** — the same meaning in more than one place — costs
  maintenance and tokens, and inflates the meaning's apparent rank.
- The **environment** is a source of truth too — `package.json` scripts, config files, the directory
  layout, `--help` output. A document that restates it is a **cache**: a copy of a lookup, earning
  its load only when the lookup is expensive. Cache what the agent cannot find by looking; leave
  one-file lookups to the environment, where they cannot go stale.
- Check every line for **relevance**: does it still bear on what the document does? A line loses
  relevance by never bearing on the task or by going stale as the world changes. Without a pruning
  discipline the default fate is **sediment**: stale layers that settle because adding feels safe
  and removing feels risky.
- Hunt **no-ops** sentence by sentence: an instruction the model already obeys by default pays load
  to say nothing. The test — does it change behavior versus the default? — is model-relative: two
  people disagreeing about a no-op disagree about the default, and settle it by running the
  document, not by debate. When a sentence fails, delete the whole sentence. The same test grades
  leading words: a word too weak to beat the default is a no-op, and the fix is a stronger word, not
  a different technique.
- The exception is an **anchor rule**: a rule the model would follow by default that still settles a
  recurring question or documents a convention reviews hold changes against. Judge deletions by
  "does this settle a question that recurs?", not only "would the model comply without it?".
