# Review checklist

Audit a diff or whole-file sweep at the scope each question names. Check the document once, each
added or changed instruction (every instruction in a sweep), skill composition and scripts where
present, then deletions. Each question names its governing rule or reference section.

- [Document](#document)
- [Instructions](#instructions)
- [Applied skills](#applied-skills)
- [Bundled scripts](#bundled-scripts)
- [Deletions](#deletions)

## Document

- [ ] In a diff, is the net rule count equal to or lower than before? If higher, name an existing
      rule the change could replace or delete. (spend the budget deliberately)
- [ ] If the user's request, repository instructions, or another skill can govern the same behavior,
      does the document state which one wins? (one source of truth per meaning)
- [ ] If a target cannot load the authoritative source, does the derived artifact or its closest
      governing instruction file name that source and the target constraint, and does the copy
      contain only behavior whose trigger can occur on the target? (derived instruction copies)
- [ ] Does the derived artifact or its closest governing instruction file name the synchronization
      condition and any applicable measurable invariant? (derived instruction copies)
- [ ] When an existing formatter, generator, or check can enforce synchronization, does the
      governing instruction use it? (derived instruction copies)
- [ ] If the change leaves a disclosed reference over 100 lines after trimming, was it split along
      distinct branches with a pointer to each part from the entry document, or opened with a
      contents list? (splitting by length)
- [ ] If the change grows a repository instruction file, do the root file and the directory-scoped
      files on the path to each working directory stay under the 32 KiB default target, measured
      with `wc -c`? (the scope ladder)
- [ ] Are rules ordered by importance rather than appended as they accumulate? (order rules by
      importance)

## Instructions

- [ ] Which failure does this rule prevent? (spend the budget deliberately)
- [ ] Does the instruction restate scripts, config, layout, or `--help` output? If tooling enforces
      the behavior, is the instruction still needed to determine when the check runs or how its
      result gates the workflow? (spend the budget deliberately)
- [ ] If the instruction covers a fragile path or repeated observed failures show a goal and default
      are insufficient, does it bind the needed command, order, or script? For an isolated
      recoverable mistake, would fixing the ambiguity or example suffice? (degrees of freedom)
- [ ] If the instruction binds a path, is the path fragile? If a wrong turn fails loudly and the
      agent can recover, have a goal and default proved insufficient in repeated runs? (degrees of
      freedom)
- [ ] If the instruction stops for the user, does it ask only for a decision or authority still
      missing from the request or conversation, after authorized reversible preparation? Does it
      preserve authorization already given instead of making preparation itself a reason to ask?
      (name the stops)
- [ ] Does the line state a meaning that already has a home elsewhere in the file, its references,
      another skill, or an authoritative source? (one source of truth per meaning)
- [ ] Does the line introduce a second name for an existing concept? (one term per concept)
- [ ] Does every branch of the document need this line, or does it belong behind a pointer? (inline
      what every branch needs)
- [ ] If the line points to a disclosed reference, does the entry document point to that reference
      too, so no reference is reached only through another disclosed reference? (inline what every
      branch needs)
- [ ] If the line is a pointer, does its wording name its triggers, and its exclusions where the
      triggers also match a request the pointer should not take? (pointers as routing predicates)
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
- [ ] Does every bare "this", "it", or "they" have one candidate antecedent, no more than one
      sentence away? (resolve every pronoun)
- [ ] If the line adds an example, does one sentence name what makes it correct? (prefer one example
      over three rules)
- [ ] If several sentences restate one concept, does one compact term carry it, repeated exactly?
      (anchor repeated concepts with leading words)

## Applied skills

- [ ] Does the orchestrating skill own the authority envelope, sequence, stopping conditions, and
      terminal outcome while the supporting skill produces and verifies its artifact, or applies its
      discipline, within that authority? (composing skills)
- [ ] Does the orchestrating skill pass inputs and constraints instead of copying the supporting
      skill's guidance? If the supporting skill may be absent, does the workflow stop with a hand
      off, or keep only the fallback behavior required to reach one of its terminal outcomes?
      (composing skills)

## Bundled scripts

- [ ] Does each pointer state the script's mode, and does each run instruction give the command
      line, the run's needs, the missing-dependency route, and the next step for every outcome?
      (bundled scripts)
- [ ] Does the script distinguish workflow outcomes by exit code or structured status, keep errors
      apart from negative results, and give each default its reason? (bundled scripts)
- [ ] Does the script add a dependency beyond `sh`, `bash`, and the POSIX utilities only when the
      workflow requires that dependency or no POSIX utility fits, declare each one, and check each
      declared tool at the script's start? (bundled scripts)

## Deletions

For each deleted or removal-candidate instruction, ask:

- [ ] Does tooling or another rule make the instruction redundant? Name which, and preserve any
      requirement about when a check runs or how its result gates the workflow. (spend the budget
      deliberately)
- [ ] Does the line settle a question that recurs, or anchor a documented convention? If yes, keep
      the line even when the model would comply without it. (anchor rules)
- [ ] Does any other rule reference the line or depend on a term it introduces? Update each such
      rule with the deletion. (one term per concept)
