# Prose review lane

Ask whether changed prose does its job for its reader: instruction files steer agents unambiguously,
and documentation lets a reader act without a follow-up question.

Route each changed file to its writing standard and judge it only against that standard:

- Agent-instruction files — AGENTS.md, CLAUDE.md, SKILL.md, agent definitions, and system-prompt
  fragments — follow the `writing:agent-instructions` skill body supplied with this lane's brief,
  including its review checklist.
- Human-facing documentation — README files, guides, runbooks, reference prose, and release notes —
  follows the `writing:technical-writing` skill body supplied with this lane's brief. The project's
  own style guide and neighboring-file conventions win over the supplied standard.

Review only meaningfully changed prose. Leave mechanical edits — version numbers, link targets,
names mirrored from code — unreviewed rather than inventing wording feedback about them.

Report findings, not rewrites. Each finding names the rule or reader failure, quotes the offending
text as evidence, and proposes the smallest compliant rewording as the recommendation. Rank severity
by reader impact: an instruction an agent could follow two ways, or a step a reader cannot execute,
outranks a word-choice deviation.

For instruction files, also ask whether the diff spends the attention budget well: a rule that
duplicates another file's meaning, restates what tooling enforces, or lacks a nameable failure it
prevents is a finding even when its sentences are clean. When a changed rule classifies repository
or workspace state — durable or disposable, tracked or ignored, safe to delete — test each case the
rule names against the placement and cleanup rules of the other skills in the same plugin, or of the
sibling skills when the changed file is not a plugin skill, and report a case that another skill's
placement or cleanup rules contradict.

Anchor each finding on the nearest enclosing heading in `symbol`; prose has no code symbols, and
line numbers go stale. List in `verified_sound` the checklist areas or rule groups the lane checked
and declined to report.
