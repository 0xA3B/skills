# Sub-agent prompts

A sub-agent prompt is instructions with a one-dispatch lifetime. The house style in `SKILL.md` still
applies — imperatives with a named actor, conditions before instructions, positive framing, testable
rules, one example over three rules, resolved pronouns — but the document mechanics do not: there is
nothing to prune, no disclosure hierarchy, and no second reader to keep a source of truth for. What
replaces them is the dispatch boundary. By default a sub-agent starts with an empty context, cannot
ask a follow-up question, and reports back through a single final message. Every rule in this file
exists because one of those three facts makes an otherwise-fine prompt fail.

Some harnesses can instead fork the parent conversation into the sub-agent. When the dispatch is a
fork, the sub-agent already holds the session context: skip the context-carrying rules below and
keep the return contract, the decision rules, and the scope bounds. When you cannot tell which model
applies, assume fresh context.

## Carry the context

The sub-agent knows nothing the prompt does not say. It has not seen the conversation, the plan, or
the files already read.

- State every fact the task needs: absolute paths, symbol names, branch names, constraints, and
  decisions already made. A phrase like "the approach we discussed" or "the file above" points at
  nothing.
- Name the repository conventions that bind the work — the validation command, the commit style, the
  file the sub-agent must follow — instead of assuming the sub-agent will discover them.
- Include only what the task needs. Unrelated background competes with the instructions for the
  sub-agent's attention, and the sub-agent cannot ask which parts matter.

## State the return contract

The final message is the only channel back; work not reported is work lost.

- Say what the sub-agent must return: the format, the fields, and the granularity. "Return a list of
  findings, each with file, line, and a one-sentence defect statement" is a contract; "report back"
  is not.
- Say what to leave out of the report when the raw material is large — file dumps, full logs,
  intermediate steps — so the answer survives the trip.
- For machine-consumed results, show the exact output shape once as an example rather than
  describing it.

## Decide the forks in advance

The sub-agent cannot ask, so ambiguity becomes a guess.

- Give a decision rule for each foreseeable fork: "If the test fails for an unrelated reason, skip
  it and note the skip." When you cannot enumerate the forks, give the default: "If a choice is not
  covered here, take the reversible option and flag it in the report."
- End on a completion criterion that is checkable and demanding, exactly as `SKILL.md` requires for
  workflow steps: "every caller of the renamed function updated and the build passing", not "update
  the callers".
- Bound the scope: name what the sub-agent must not touch, and whether the task is read-only. A
  sub-agent that discovers adjacent problems should report them, not fix them, unless the prompt
  says otherwise.

## Parallel dispatches

When several sub-agents run at once, make each prompt self-contained and the work disjoint: no two
prompts may edit the same files, and no prompt may depend on another's result. If one task needs
another's output, sequence the dispatches instead.
