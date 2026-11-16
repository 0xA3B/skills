# Repository tooling source

## Project conventions

- Register each sub-package directory under `src/` in the `no-restricted-imports` patterns in
  `.oxlintrc.json`. The patterns match by directory name, so give a sub-package a name that no other
  `src/` directory uses. `engineering:codebase-design` states when modules earn a package directory.
- Keep the plugin linter's checks local and deterministic; run a check that reads git history, such
  as the plugin version check, as its own command, not as a plugin linter rule.

## Ubiquitous language

While you work under `src/` or `tests/`, use these terms as well as the root terms, with these
meanings. When a request, or code the task changes, uses an alias to avoid or uses a term with a
different meaning, say so before you continue. Change this section through
`engineering:ubiquitous-language`.

- **Diagnostic**: A structured plugin-linter finding with a code, file, message, and pointer.
  Aliases to avoid: error string.
- **Validation context**: The shared lint-run state passed through plugin-linter checks instead of
  module-level mutable globals. Aliases to avoid: globals.
- **Workspace seed**: Committed project content under `evals/seeds/<name>/`, copied into a case
  workspace and initialized as a git repository before the agent runs. Aliases to avoid: scaffold,
  checkout, fixture workspace.
- **Routing assertion**: The `invoke-instead` check on a skip case: the named alternate must be the
  only skill that fires. Aliases to avoid: route-to, redirect.
- **Compound case**: An invoke case whose request chains outcomes that other skills also own; it
  lists those skills under `invoke-or` and passes when the target or a listed skill makes the
  trigger decision. Aliases to avoid: chained case, invoke-also.
- **Dependent case**: A case in another skill's fixture that names the target skill, in a routing
  assertion or a compound case's `invoke-or` list. Aliases to avoid: dependency.
- **Seeded case**: A trigger fixture case whose resolved workspace names a given workspace seed.
  Aliases to avoid: seed dependent, dependent case.
- **Attempt**: One execution of one trigger fixture case within a trigger eval, numbered from 1;
  `--repeat <n>` runs n attempts of each selected case. Aliases to avoid: repeat, iteration, trial.
- **Eval lane**: The per-agent adapter a trigger eval runs through, owning that agent's staging,
  case execution, and invocation observations. Aliases to avoid: review lane, harness.
- **Invocation signal**: The observed evidence that the agent invoked a staged skill: a Codex
  command that prints a staged skill file from its first line, or a Claude Code assistant message
  with Skill tool calls. Aliases to avoid: telemetry, canary.
- **Trigger decision**: An attempt's first invocation signal and the staged skills it loads; later
  loads are workflow behavior outside the trigger decision. Aliases to avoid: observation window.
- **Applied skill**: A skill that another skill's workflow loads in one of its steps, declared under
  `applies` in the applying skill's trigger fixture; its load in the same trigger decision as the
  applying skill is a dependency load, not a separate invocation. A hand-off target is not an
  applied skill. Aliases to avoid: dependency, mention.

Relationships:

- A **Trigger eval** runs one or more **Attempts** of each selected case; the case passes only when
  every **Attempt** passes.
- An **Attempt** has zero or one **Trigger decision**.
- Each **Trigger fixture** case runs in zero or one **Workspace seed**; a **Workspace seed** is
  shared by every fixture that names it, and the cases whose resolved workspace names it are its
  **Seeded cases**.
- A **Trigger fixture** skip case carries zero or one **Routing assertion**; the cases whose
  **Routing assertion** names a skill are that skill's **Dependent cases**.
- A **Compound case** lists one or more other skills and is a **Dependent case** of each; it asserts
  only the first **Trigger decision**
  ([ADR 0004](../docs/adr/0004-compound-cases-assert-the-first-trigger-decision.md)).
