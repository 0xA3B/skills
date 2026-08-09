# Review checklist

Audit questions for a diff to an instruction file, and for periodic sweeps of a whole file. Each
question names the rule it applies from `SKILL.md`.

For each changed or added line, ask:

- [ ] Which failure does this rule prevent? (spend the budget deliberately)
- [ ] Is the net rule count equal or lower than before? If higher, what was considered for removal?
      (spend the budget deliberately)
- [ ] Does the line restate what the environment already states — scripts, config, layout, `--help`
      output? (spend the budget deliberately)
- [ ] Does the line state a meaning that already has a home elsewhere in the file or its references?
      (one source of truth per meaning)
- [ ] Does it introduce a second name for an existing concept? (one term per concept)
- [ ] Does every branch of the document need this line, or does it belong behind a pointer? (inline
      what every path needs)
- [ ] If the line is a pointer, does its wording name the triggers and exclusions? (pointers as
      routing predicates)
- [ ] Is the actor named and the verb imperative? (imperatives with a named actor)
- [ ] If conditional, does the condition come first? (condition before instruction)
- [ ] If it prohibits, does it state the replacement behavior? (frame rules positively)
- [ ] Can a reviewer verify compliance from a diff alone? (make every rule testable)
- [ ] If the line ends a step, can the agent tell done from not-done, and does the bound demand
      enough legwork? (checkable, demanding completion criteria)
- [ ] Is it placed according to its importance, not appended at the end? (order rules by importance)

For each deleted or removal-candidate line, ask:

- [ ] Is the behavior it required now enforced by tooling, or covered by another rule? Name which.
      (spend the budget deliberately)
- [ ] Does it settle a question that recurs, or anchor a documented convention? If yes, keep it even
      when the model would comply without it. (anchor rules)
- [ ] Does any other rule reference it or depend on a term it introduces? Update them with the
      deletion. (one term per concept)
