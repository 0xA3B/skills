# Skill Authoring Glossary

Use this vocabulary when deciding how to shape a skill.

## Invocation

**Model-invoked skill**: A skill the agent can discover automatically and another skill can direct
the model to use. Its description creates permanent context load.

**Manual-only skill**: A skill reached through explicit user invocation. It avoids permanent context
load but adds cognitive load for the user, who must remember it exists.

**Trigger contract**: The description text that decides when a model-invoked skill should load.

**Context pointer**: Wording held in context that names out-of-context material and says when to
read it. The pointer's wording, not the target file, controls whether disclosure works reliably.

## Information Hierarchy

**Step**: An ordered action the agent performs. A step ends on a completion criterion.

**Reference**: A rule, definition, fact, catalog, example, or conditional detail consulted on demand
rather than performed in sequence.

**Progressive disclosure**: Moving conditional reference material out of `SKILL.md` behind a strong
context pointer so the primary workflow remains legible.

**Co-location**: Keeping a concept's definition, rules, and caveats together instead of scattering
one meaning across a file.

## Steering

**Completion criterion**: The checkable condition that tells the agent a step or workflow is done.
Its clarity resists premature completion; its demand determines how much legwork the agent performs.

**Leading word**: A compact concept already present in model priors that anchors repeated behavior,
such as `tracer bullet`, `frontier`, or `tight loop`.

**Premature completion**: Ending a step before its completion criterion is met because later work is
pulling attention forward. Sharpen the criterion first; split the sequence only when the bound is
irreducibly fuzzy and the failure is observed.

**Negation**: Steering primarily by naming forbidden behavior. Prefer a positive target; keep a
prohibition only for a hard guardrail and pair it with what to do instead.

## Pruning

**Single source of truth**: One authoritative home for each meaning.

**Duplication**: The same meaning stated in more than one place, increasing maintenance cost and
giving the rule accidental extra weight.

**No-op**: An instruction that does not change behavior relative to the model's default.

**Sediment**: Stale or irrelevant guidance retained because adding feels safer than removing.

**Sprawl**: A body that is too long even when its content is live and unique. Cure it through
progressive disclosure or a justified split by branch or sequence.
