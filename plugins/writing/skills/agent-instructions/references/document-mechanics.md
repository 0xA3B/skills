# Document mechanics

Structural mechanics for documents agents consume: the two loads, pointers, the information
hierarchy, derived instruction copies, and splitting. The sentence-level rules live in `SKILL.md`,
and [line-mechanics.md](line-mechanics.md) owns the lines inside a document; this file owns the
decisions about documents.

## The two loads

Every document and pointer spends one of two budgets:

- **Context load** — the cost of always-loaded material on the agent's window: an `AGENTS.md` line,
  a skill description, anything in context every turn, spending tokens and attention whether or not
  it fires.
- **Cognitive load** — the cost on the human: which documents exist and when to reach for each. The
  human is the index. Cognitive load is not a cost to minimize — it is the price of human agency.
  Where reaching the material is a decision only the user can make, spend cognitive load; elsewhere,
  remove it with a pointer.

Material reached only through a pointer escapes context load at the price of the pointer's own line.
Material with no pointer at all rides entirely on cognitive load.

## Pointers

A pointer is held in context and names material outside context. A skill description is one; a line
in `AGENTS.md` naming a document is the same object. The pointer's wording, not its target, decides
when the agent reaches the material — and how reliably.

A pointer does two jobs: state what the material is, and list the **branches** that should trigger
reading it (a branch is a distinct case the document handles, so different runs take different
branches through it). An always-loaded pointer earns harder pruning than the body it points to:

- Front-load the leading word; the pointer is where it does its triggering work.
- Keep one trigger per branch. Synonyms that rename a single branch are one branch written twice;
  collapse them.
- Cut identity the body already carries.

## Information hierarchy

A document mixes two content types — **steps** (the ordered actions the agent performs) and
**reference** (definitions, rules, and facts consulted on demand). Place each piece on a ladder
ranked by how immediately the agent needs it:

1. **In-file step** — the primary tier: what the agent does, in order.
2. **In-file reference** — material in the file that the agent consults on demand. A flat peer set
   (every rule of a review on one rung) is a fine arrangement, not a smell.
3. **Disclosed reference** — a separate file reached through a pointer, loaded only when the pointer
   fires.

Push too little down and the top bloats; push too much and needed material hides. Branching is the
cleanest test: inline what every branch needs, and disclose what only some branches reach. When a
document has steps, in-file reference that should be disclosed buries them and makes attending to
them a coin flip.

**Co-location** decides what sits beside a piece once its rung is chosen: keep a concept's
definition, rules, and caveats under one heading, so reading one part brings its neighbors.
Scattering fragments one meaning across many places; duplication repeats one meaning in two places —
different failures, same cure in a one-source-of-truth pass.

**Sprawl** is a document too long even when every line is live and unique. Attention thins across
the excess. Cure sprawl with the ladder: disclose reference behind pointers, and split by branch or
sequence so each branch carries only what it needs.

## Derived instruction copies

A target that cannot load the authoritative instructions may require a copy, such as a standalone
prompt for a chat interface. Treat that copy as a derived artifact rather than a second source of
truth:

- Name the authoritative source and the target constraint that requires the copy in the derived
  artifact or its closest governing instruction file.
- Copy only behavior whose trigger can occur on the target.
- In the same place, define when an edit to the authoritative source requires updating the copy, and
  any measurable target invariant that applies, such as a character limit.
- When an existing formatter, generator, or check can enforce the relationship, use it instead of
  relying only on a reminder.

## Splitting

Splitting one document into two spends one of the two loads. When one of these grounds applies,
split; otherwise keep the document whole:

- **By sequence** — if you observe premature completion on a step after sharpening its completion
  criterion, split the run of steps at that step. Hiding works only across a real context boundary,
  a hand off or a sub-agent dispatch; an inline reference leaves the later steps in context and
  clears nothing. Merging sequences has the reverse cost: it exposes each step to what follows.
- **By invocation** — skill-specific; see [skill-mechanics.md](skill-mechanics.md).
- **By length** — keep a disclosed reference under 100 lines. Agents often read a long file in a
  preview or in chunks, such as its first 80 or 240 lines, and act on the part they saw. When a
  reference runs longer, trim it first. If it still runs longer and its parts serve distinct
  branches, split it along them and point to each part from the entry document. If every reader
  needs the whole file, open it with a contents list that names its sections in heading order.
