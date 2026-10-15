# Review checklist

Audit a diff to an instruction file, or sweep a whole file, section by section. Each section names
its scope, and each question names the rule or reference section it applies.

## Document

Once per document:

- [ ] In a diff, is the net rule count equal to or lower than before? If higher, name an existing
      rule the change could replace or delete. (spend the budget deliberately)
- [ ] If the document is or governs a derived instruction copy, does it meet each item of "Derived
      instruction copies" in [document-mechanics.md](document-mechanics.md)? (derived instruction
      copies)
- [ ] If the change leaves a disclosed reference over 100 lines after trimming, was it split along
      distinct branches with a pointer to each part from the entry document, or, when every reader
      needs the whole file, opened with a contents list? (splitting by length)
- [ ] If the change grows a repository instruction file, do the root file and the directory-scoped
      files on the path to each working directory stay under 32 KiB combined, measured with `wc -c`?
      (the scope ladder)

## Instructions

For each added or changed instruction of a diff, or each instruction of a swept file, walk the Rules
in `SKILL.md` in order. Record each rule the instruction fails, with the fix, or record that it
passes every rule.

## Applied skills

When the skill applies another skill:

- [ ] Does the orchestrating skill own the authority envelope, the workflow sequence, and the
      terminal outcome, while the supporting skill produces and verifies its artifact, or applies
      its discipline, within that envelope? (composing skills)
- [ ] Does the orchestrating skill pass inputs and constraints instead of copying the supporting
      skill's guidance? If the supporting skill may be absent, does the workflow stop with a hand
      off, or keep only the fallback behavior required to reach one of its terminal outcomes?
      (composing skills)

## Bundled scripts

When the skill bundles a script:

- [ ] Does each pointer state the script's mode, and does each run instruction give the command
      line, the run's needs, the missing-dependency route, and the next step for every outcome?
      (bundled scripts)
- [ ] Does the script distinguish workflow outcomes by exit code or structured status, keep errors
      apart from negative results, and give each default its reason? (bundled scripts)
- [ ] Does the script add a dependency beyond `sh`, `bash`, and the POSIX utilities only when the
      workflow requires that dependency or no POSIX utility fits, declare each one, and check each
      declared tool at the script's start? (bundled scripts)

## Deletions

For each deleted or removal-candidate instruction:

- [ ] Does tooling or another rule make the instruction redundant? Name which. Keep any part that
      decides when a check runs or how its result gates the workflow. (spend the budget
      deliberately)
- [ ] Does the instruction settle a question that recurs, or anchor a documented convention? If yes,
      keep it even when the model would comply without it. (anchor rules)
- [ ] Does any other instruction reference the deleted one or depend on a term it introduces? Update
      each such instruction with the deletion. (one term per concept)
