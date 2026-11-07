# Repository tooling source

## Project conventions

- Group modules under `src/` into a sub-package directory only when the group has callers outside it
  and a smaller public seam than its parts. The sub-package's `index.ts` only re-exports; its
  sibling modules import each other directly and are private to production code outside the
  directory. Register each sub-package in the `no-restricted-imports` patterns in `.oxlintrc.json`;
  tests may import private modules.
- Keep the plugin linter's checks local and deterministic; run a check that reads git history, such
  as the plugin version check, as its own command, not as a plugin linter rule.

## Code Review Rules

- In the Codex skill-read classifier (`src/trigger-evals/lanes/skill-reads.ts`), report a shell form
  as a finding only when a recorded Codex run used it. Report a form derived from shell syntax as a
  note, even when its failure is silent: observed Codex commands set the classifier's scope.

## Terminology

- **Diagnostic**: A structured plugin-linter finding with a code, file, message, and pointer.
  Aliases to avoid: error string.
- **Validation context**: The shared lint-run state passed through plugin-linter checks instead of
  module-level mutable globals. Aliases to avoid: globals.
