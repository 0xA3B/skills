# Code comments

Rules for when a code comment earns its place and what it says, applied while code is written and
checked when changes are reviewed, so comments are neither noise nor missing where a reader needs
them. The basis is John Ousterhout's _A Philosophy of Software Design_. Where the repository
documents its own comment conventions, such as a doc-comment format, they win over this file. For
the prose of a long-form docstring, apply `writing:technical-writing` when that skill is available.

## Rules

Cite a rule by its bold name.

1. **States what the code cannot.** Write a comment only for what a reader would otherwise have to
   work out or could not know from the code: intent, a constraint, a unit, a precondition, or the
   reason for a choice.
2. **Interface comment.** An interface comment is part of the interface. On a module that callers
   use, state what a caller must know to use it correctly and the signature does not show: behavior,
   units, invariants, error modes, and ownership or lifetime of what passes in and out. Write it at
   a higher level of abstraction than the code; a comment that names internal steps, algorithms, or
   private state leaks the implementation. A caller who would have to read the implementation to use
   the module correctly is missing an interface comment.
3. **Says why, not what.** An implementation comment explains why the code takes this path. A
   comment that restates the code in words is noise; delete it.
4. **Moves with its code.** Keep a comment next to the code it describes, and change or delete it in
   the same edit that changes that code. A comment that no longer matches its code is a defect.
5. **No commented-out code.** Delete code instead of commenting it out; version control keeps it.
6. **Speaks the ubiquitous language.** Comments and identifiers use the terms of
   `AGENTS.md ## Ubiquitous language` when that section exists. When a comment's only job is to
   explain what a name means, the name is wrong or the term is missing: rename the identifier, or
   propose the term through `engineering:ubiquitous-language`, and do not add the gloss.
7. **Workaround test.** When a comment has to argue across several sentences that a workaround is
   safe, fix the code so the argument is unnecessary, then delete the comment. When something the
   project cannot reshape forces the behavior, keep the comment under the keep-list instead. When
   the fix is out of scope for the current change, cut the comment to a short TODO that names the
   condition for removing the workaround.

A surprise in the project's own code that a short why comment resolves is not a refactor demand; the
comment is an acceptable outcome. The workaround test applies only when the explanation has to argue
for safety.

## Keep-list

These comments always earn their place:

- license or legal headers;
- doc comments that define a public API contract;
- non-obvious behavior forced by something the project cannot reshape, such as an external
  dependency, platform, vendor, or protocol, with a link to its source when one exists;
- a link to an issue or specification that states a constraint the code cannot express;
- the pointer to a decision record, written as `engineering:decision-records` "Point from the code"
  directs;
- a TODO that names the condition for removing it, written as `engineering:receiving-feedback`
  directs for a deferred finding.

## Review

Report a comment finding only with the rule it breaks, cited by bold name, and the offending comment
quoted; for a missing interface comment, quote the signature and name what a caller cannot learn
from it. A comment concern that names no rule here is a style nit: do not report it. Never report a
keep-list comment as noise.
