# Review checklist

Audit questions for a diff to an instruction file, and for periodic sweeps of a whole file. Each
question names the rule or reference section it applies.

For each changed or added line, or each line of a swept file, ask:

- [ ] Which failure does this rule prevent? (spend the budget deliberately)
- [ ] In a diff, is the net rule count equal to or lower than before? If higher, name an existing
      rule the change could replace or delete. (spend the budget deliberately)
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
- [ ] Does the line introduce a second name for an existing concept? (one term per concept)
- [ ] Does every branch of the document need this line, or does it belong behind a pointer? (inline
      what every branch needs)
- [ ] If the line points to a disclosed reference, does the entry document point to that reference
      too, so no reference is reached only through another disclosed reference? (inline what every
      branch needs)
- [ ] If the change leaves a disclosed reference over 100 lines, was it trimmed, split along
      distinct branches with a pointer to each part from the entry document, or opened with a
      contents list? (splitting by length)
- [ ] If the line is a pointer, does its wording name its triggers, and its exclusions where a
      sibling pointer or skill should take a request this one also matches? (pointers as routing
      predicates)
- [ ] Is the actor named and the verb imperative? (imperatives with a named actor)
- [ ] If the line is conditional, does the condition come first? If the condition limits an action,
      does the line say what to do otherwise? (condition before instruction)
- [ ] Does the line state the behavior it wants and when that behavior applies, with no capitals or
      intensity words carrying the force? (state the target and when it applies)
- [ ] If the line prohibits, does it name a specific pattern the agent produces by default, and the
      replacement? (state the target and when it applies)
- [ ] If the line is a completion criterion, or a condition that guards a fragile path, can the
      agent tell whether it holds without inventing the meaning of an evaluative term? (make every
      rule auditable)
- [ ] Does the rule name evidence or a terminal state that verifies compliance from the diff,
      command output, or resulting state? (make every rule auditable)
- [ ] If the line ends a step, can the agent tell done from not-done, and does the criterion cover
      every item in the step's scope? (checkable, demanding completion criteria)
- [ ] Is the line placed according to its importance, not appended at the end? (order rules by
      importance)
- [ ] Does every bare "this", "it", or "they" have one candidate antecedent, no more than one
      sentence away? (resolve every pronoun)
- [ ] If the line adds an example, does one sentence name what makes it correct? (prefer one example
      over three rules)
- [ ] If several sentences restate one concept, does one compact term carry it, repeated exactly?
      (anchor repeated concepts with leading words)

For a skill that applies another skill, ask:

- [ ] Does the orchestrating skill own the authority envelope, sequence, stopping conditions, and
      terminal outcome while the supporting skill produces and verifies its artifact, or applies its
      discipline, within that authority? (composing skills)
- [ ] Does the orchestrating skill pass inputs and constraints instead of copying the supporting
      skill's guidance? If the supporting skill may be absent, does the workflow stop with a hand
      off, or keep only the fallback behavior required to reach one of its terminal outcomes?
      (composing skills)

For a skill that bundles a script, ask:

- [ ] Does each pointer state the script's mode, and does each run instruction give the command
      line, the run's needs, the missing-dependency route, and the next step for every outcome?
      (bundled scripts)
- [ ] Does the script give every outcome that changes the workflow's next step its own exit code,
      keep errors apart from negative results, and give each default its reason? (bundled scripts)
- [ ] Does the script add a dependency beyond `sh`, `bash`, and the POSIX utilities only when the
      workflow requires that dependency or no POSIX utility fits, declare each one, and check each
      declared tool at the script's start? (bundled scripts)

For each deleted or removal-candidate line, ask:

- [ ] Is the behavior it required now enforced by tooling, or covered by another rule? Name which.
      (spend the budget deliberately)
- [ ] Does the line settle a question that recurs, or anchor a documented convention? If yes, keep
      the line even when the model would comply without it. (anchor rules)
- [ ] Does any other rule reference the line or depend on a term it introduces? Update each such
      rule with the deletion. (one term per concept)
