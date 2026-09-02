# Review checklist

Audit questions for a diff to an instruction file, and for periodic sweeps of a whole file. Each
question names the rule it applies from `SKILL.md`.

For each changed or added line, ask:

- [ ] Which failure does this rule prevent? (spend the budget deliberately)
- [ ] Is the net rule count equal or lower than before? If higher, what was considered for removal?
      (spend the budget deliberately)
- [ ] Does the line restate what the environment already states — scripts, config, layout, `--help`
      output? (spend the budget deliberately)
- [ ] Does the line state a meaning that already has a home elsewhere in the file, its references,
      another skill, or an authoritative source? (one source of truth per meaning)
- [ ] If a target cannot load the authoritative source, does the derived artifact or its closest
      governing instruction file name that source and the target constraint, and does the copy
      contain only behavior whose trigger can occur on the target? (derived instruction copies)
- [ ] Does the derived artifact or its closest governing instruction file name the synchronization
      condition and any applicable measurable invariant? (derived instruction copies)
- [ ] When an existing formatter, generator, or check can enforce synchronization, does the
      governing instruction use it? (derived instruction copies)
- [ ] Does it introduce a second name for an existing concept? (one term per concept)
- [ ] Does every branch of the document need this line, or does it belong behind a pointer? (inline
      what every path needs)
- [ ] If the line is a pointer, does its wording name the triggers and exclusions? (pointers as
      routing predicates)
- [ ] Is the actor named and the verb imperative? (imperatives with a named actor)
- [ ] If conditional, does the condition come first? (condition before instruction)
- [ ] If it prohibits, does it state the replacement behavior? (frame rules positively)
- [ ] Can the agent determine which branch applies from observable conditions without inventing the
      meaning of an evaluative term? (make every rule auditable)
- [ ] Does the rule name evidence or a terminal state that verifies compliance from the diff,
      command output, or resulting state? (make every rule auditable)
- [ ] If the line ends a step, can the agent tell done from not-done, and does the bound demand
      enough legwork? (checkable, demanding completion criteria)
- [ ] Is it placed according to its importance, not appended at the end? (order rules by importance)

For a skill that applies another skill, ask:

- [ ] Does the orchestrating skill own the authority envelope, sequence, stopping conditions, and
      terminal outcome while the supporting skill produces and verifies its artifact, or applies its
      discipline, within that authority?
- [ ] Does the orchestrating skill pass inputs and constraints instead of copying the supporting
      skill's guidance? If the supporting skill is optional, does the fallback contain only behavior
      required to reach a safe terminal outcome?

For each deleted or removal-candidate line, ask:

- [ ] Is the behavior it required now enforced by tooling, or covered by another rule? Name which.
      (spend the budget deliberately)
- [ ] Does it settle a question that recurs, or anchor a documented convention? If yes, keep it even
      when the model would comply without it. (anchor rules)
- [ ] Does any other rule reference it or depend on a term it introduces? Update them with the
      deletion. (one term per concept)
