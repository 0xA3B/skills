# Skill mechanics

What changes when the document is a skill: the invocation choice, composing skills, the trigger
contract, splitting by mode and by invocation, and router skills. Everything else about writing the
body is the universal guidance in `SKILL.md`, [document-mechanics.md](document-mechanics.md), and
[line-mechanics.md](line-mechanics.md).

## Invocation

Two postures, trading the two loads:

- A **model-invoked skill** keeps a model-facing description, so the agent can load it autonomously
  and another skill can direct the model to it. The user keeps reach too — model-invocation adds
  agent discovery, never removes the human's. The description is the skill's top-level pointer,
  always loaded: permanent context load in exchange for discoverability. A model-invoked skill whose
  content is all reference is also a home for shared reference, because other skills can reach it.
- A **manual-only skill** is reached only by explicit user invocation. Zero context load, but the
  human is the index that must remember it exists — cognitive load. No other skill can fire it;
  reference a manual-only skill from another document only as a hand off that recommends the
  explicit invocation.

If neither the agent nor another skill must reach a skill on its own, make it manual-only and pay no
context load; otherwise make it model-invoked.

Shared reference that two manual-only skills both need can live in neither: push it to a plain file
outside the skill system that both point at.

The invocation posture decides who reads the description, and so the description's form. Write a
model-invoked skill's description as a trigger contract, as "Trigger contracts" below directs. No
agent reads a manual-only skill's description; the user reads it in a command menu. Write it as a
summary of what the skill does and produces, in one or two sentences, without "Use when" or "Do not
use" clauses. When a change switches a skill's invocation posture, rewrite the description in the
other form in the same change.

## Composing skills

When one skill applies another model-invoked skill during the same workflow, assign ownership by
axis:

- The orchestrating skill owns the authority envelope, the workflow sequence, and the terminal
  outcome.
- The supporting skill owns producing and verifying its artifact, or applying its discipline, within
  the orchestrating skill's authority envelope.

Pass the supporting skill the task inputs, repository constraints, and required outcome. Point to
its instructions instead of copying them into the orchestrating skill. If the supporting skill may
be absent, either stop with a hand off or keep only the fallback behavior required to reach one of
the workflow's terminal outcomes.

## Trigger contracts

The description of a model-invoked skill is the trigger contract that decides when it fires. Apply
"Write pointers as routing predicates" from `SKILL.md` and "Pointers" in
[document-mechanics.md](document-mechanics.md) in full, and front-load the words users type when
they ask for the skill's work.

State the predicate over the work, not over the request's wording. When the skill governs something
the session produces, write "Use whenever the session writes ..." and name the shapes the skill must
still fire on, such as a small edit or one step of a larger task; "Use when asked to write ..."
misses a request that names the outcome and not the artifact. When always-loaded guidance already
governs the session's own output, keep the predicate on the request. Drop an exclusion for a request
the predicate is already false of, unless a trigger case fails without it.

When the repository has trigger tooling, run the skill's positive and negative trigger cases on
every supported agent, and treat a description change as done when every case passes; otherwise
treat it as done when the description follows the pointer rules above.

## Splitting by mode

When a skill runs one of several mutually exclusive modes per invocation — create vs update vs
review — only one mode is live in any run. If each mode owns a substantial body of exclusive
instructions — its own steps, formats, and final-response shape — move each mode into its own
reference file, keep the rules every mode shares in `SKILL.md`, and route with a per-mode pointer
predicate that names which file to read for which request. When one mode can flow into another, end
the earlier mode's reference with a pointer to the later mode's file.

Keep modes that share one workflow spine and differ by a stopping point, a parameter, or a small
delta inline as branch rules. Splitting them either duplicates the spine in every file or yields
references too thin to earn the pointer hop.

## Splitting by invocation

When a distinct leading word, one users type in prompts, should trigger part of a skill on its own,
or another skill must reach that part, split the part off as a model-invoked skill.

## Router skills

When the user reports losing track of which manual-only skill to run, add one manual-only **router
skill** that names the others and when to reach for each, so the user remembers one skill instead of
many.
