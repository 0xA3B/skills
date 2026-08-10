---
name: improve-codebase-architecture
description: >-
  Find evidence-backed architectural deepening opportunities in a codebase. Use when the user wants
  refactoring candidates, better module design, simpler interfaces, stronger testability, or a
  focused codebase architecture review.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/engineering/improve-codebase-architecture
disable-model-invocation: true
argument-hint: "[scope]"
---

# Improve codebase architecture

Find architectural friction and propose deepening opportunities: changes that put more useful
behavior behind simpler interfaces and improve locality, leverage, testability, and navigation.

Load `engineering-workflows:codebase-design` before scanning, and use its vocabulary, deletion test,
and seam rules throughout this workflow.

## Outcome

Produce a prioritized, repository-grounded architecture review or a concrete plan for one selected
refactor. The first pass is analysis-only unless the user explicitly requests implementation.

## Scope before scanning

Deepening pays off where future change is likely. Choose the review area before searching:

1. Use the module, subsystem, pain point, or path named by the user.
2. Otherwise rank files by change frequency over recent history (for example
   `git log --since='6 months ago' --name-only --pretty=format:`) and start with the top hot spots.
3. Widen only when changes are scattered or evidence shows the initial area depends on a broader
   architectural problem.

## Explore

Read `AGENTS.md ## Terminology`, repository guidance, nearby docs, code, callers, and tests. Follow
concrete friction:

- understanding one concept requires bouncing through many shallow modules;
- caller knowledge, bugs, or policy are duplicated across a cluster;
- a seam is missing at real variation or added where nothing varies;
- tests reach through interfaces or depend on private structure;
- one logical change repeatedly causes scattered edits;
- code names conflict with durable domain language.

Apply the deletion test to suspected pass-through modules. Tie every candidate to specific files,
callers, tests, history, or observed navigation friction. Pattern preference without repository
evidence is not a finding.

## Present candidates

For each candidate include:

- files and modules involved;
- observed friction and evidence;
- proposed responsibility and seam change in plain language;
- benefits to locality, leverage, callers, and tests;
- approximate refactor size and the specific future change it makes cheaper;
- risks, compatibility or migration costs, and uncertainty.

Do not propose a detailed interface during the first pass. Ask which candidate the user wants to
explore or implement.

## Resolve a selected candidate

For the selected candidate, make explicit:

- behavior that belongs behind the interface;
- knowledge callers should lose;
- dependencies and adapter strategy;
- invariants, errors, ordering, configuration, and performance that remain part of the interface;
- tests that should survive the refactor;
- durable concepts the refactor introduces or renames, with proposed `AGENTS.md ## Terminology`
  entries when a name is new or collides with an existing term;
- migration and compatibility constraints.

When the remaining choices are user-owned decisions, recommend an explicit invocation of
`engineering-workflows:grill-me`.

## Completion

End with either a prioritized architecture review and next decision, or an implementation-ready plan
for the selected candidate with validation steps. Stop when every candidate is tied to specific
files, callers, tests, or history, and no unexamined hot spot from the scoped area remains.

When the session also implements the selected candidate, demonstrate each claimed benefit before
finishing: a test that exercises the new seam, caller knowledge that no longer exists, or an
equivalent observable change. A benefit that cannot be demonstrated is a risk to report, not a
result.

Record declined and deferred candidates with their evidence so a later architecture pass builds on
them instead of re-deriving them. Write them to the repository's ignored scratch directory,
confirming the path is ignored with `git check-ignore` before writing. When no ignored convention
exists, record them in the final response instead.
