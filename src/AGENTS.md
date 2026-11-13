# Repository tooling source

## Project conventions

- Register each sub-package directory under `src/` in the `no-restricted-imports` patterns in
  `.oxlintrc.json`. The patterns match by directory name, so give a sub-package a name that no other
  `src/` directory uses. `engineering:codebase-design` states when modules earn a package directory.
- Keep the plugin linter's checks local and deterministic; run a check that reads git history, such
  as the plugin version check, as its own command, not as a plugin linter rule.

## Terminology

- **Diagnostic**: A structured plugin-linter finding with a code, file, message, and pointer.
  Aliases to avoid: error string.
- **Validation context**: The shared lint-run state passed through plugin-linter checks instead of
  module-level mutable globals. Aliases to avoid: globals.
