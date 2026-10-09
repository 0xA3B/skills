# Review checklist

Audit questions for a diff to an instruction file, and for periodic sweeps of a whole file. Each
question names the rule it applies from `SKILL.md`.

For each changed or added line, ask:

- [ ] Which failure does this rule prevent? (spend the budget deliberately)
- [ ] Is the net rule count equal or lower than before? If higher, what was considered for removal?
      (spend the budget deliberately)
- [ ] Does the line restate what the environment already states — scripts, config, layout, `--help`
      output? (spend the budget deliberately)
- [ ] If the line covers a fragile path, does it give an exact command, a fixed order, or a bundled
      script, and say to follow it as written? (degrees of freedom)
- [ ] If the line binds a path, is the path fragile? If a wrong turn fails loudly and the agent can
      recover, would a goal and a default do? (degrees of freedom)
- [ ] If the line stops for the user, does it guard an irreversible or outward-facing action the
      request has not authorized, or a decision only the user can make, and does it come after the
      reversible work that makes the decision concrete? If the line asks first anywhere else, would
      authorizing the action do? (name the stops)
- [ ] Does the line state a meaning that already has a home elsewhere in the file, its references,
      another skill, or an authoritative source? (one source of truth per meaning)
- [ ] If the user's request, repository instructions, or another skill can govern the same behavior,
      does the document state which one wins? (one source of truth per meaning)
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
- [ ] If the line points to a disclosed file, does the entry document point to that file too, so no
      file is reached only through another disclosed file? (inline what every path needs)
- [ ] If the line is a pointer, does its wording name the triggers and exclusions? (pointers as
      routing predicates)
- [ ] Is the actor named and the verb imperative? (imperatives with a named actor)
- [ ] If conditional, does the condition come first? (condition before instruction)
- [ ] Does the line state the behavior it wants and when it applies, with no capitals or intensity
      words carrying the force? (state the target and when it applies)
- [ ] If it prohibits, does it name a specific pattern the agent produces by default, and the
      replacement? (state the target and when it applies)
- [ ] Can the agent determine which branch applies from observable conditions without inventing the
      meaning of an evaluative term? (make every rule auditable)
- [ ] Does the rule name evidence or a terminal state that verifies compliance from the diff,
      command output, or resulting state? (make every rule auditable)
- [ ] If the line ends a step, can the agent tell done from not-done, and does the bound demand
      enough legwork? (checkable, demanding completion criteria)
- [ ] Is it placed according to its importance, not appended at the end? (order rules by importance)
- [ ] If the line adds an example, does one sentence name what makes it correct? (prefer one example
      over three rules)

For a skill that applies another skill, ask:

- [ ] Does the orchestrating skill own the authority envelope, sequence, stopping conditions, and
      terminal outcome while the supporting skill produces and verifies its artifact, or applies its
      discipline, within that authority?
- [ ] Does the orchestrating skill pass inputs and constraints instead of copying the supporting
      skill's guidance? If the supporting skill is optional, does the fallback contain only behavior
      required to reach a safe terminal outcome?

For a skill that bundles a script, ask:

- [ ] Does each pointer state the script's mode, and does each run instruction give the command
      line, the run's needs, the missing-dependency route, and the next step for every outcome?
      (bundled scripts)
- [ ] Does the script give every outcome that changes the workflow's next step its own exit code,
      keep errors apart from negative results, and give each default its reason? (bundled scripts)
- [ ] Does the script add a dependency beyond the common tools only when the workflow requires it or
      no common tool fits, declare each one, and check each declared tool at its start? (bundled
      scripts)

For each deleted or removal-candidate line, ask:

- [ ] Is the behavior it required now enforced by tooling, or covered by another rule? Name which.
      (spend the budget deliberately)
- [ ] Does it settle a question that recurs, or anchor a documented convention? If yes, keep it even
      when the model would comply without it. (anchor rules)
- [ ] Does any other rule reference it or depend on a term it introduces? Update them with the
      deletion. (one term per concept)
