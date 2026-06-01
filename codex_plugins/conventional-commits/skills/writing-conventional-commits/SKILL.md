---
name: writing-conventional-commits
description:
  Defines Conventional Commits 1.0.0 plus a reusable commit profile. Use when drafting commit
  messages, splitting changes into logical commits, or validating type/scope/breaking-change syntax
  in any repository. Do not use for conceptual questions unless the user asks to draft, split, or
  validate a commit message.
license: MIT
---

# Writing Conventional Commits

Authoritative commit format and commit-planning workflow for the current repository. This skill is
the source of truth for any commit workflow that drafts or validates commit messages. Its successful
outcome is Conventional Commit message text, split guidance, or validation feedback that is specific
enough to use without reinterpreting the policy.

When paired with the user-invoked `conventional-commits:commit` workflow, that workflow SHOULD
delegate commit message construction and commit-format validation to this skill. Repository-specific
commit rules discovered from local docs, hooks, or validation tooling SHOULD override the default
profile in this skill.

Reference specification:

- https://www.conventionalcommits.org/en/v1.0.0/#specification

## Repository-specific Rules

- If the current repository documents commit-specific rules, follow them.
- If the current repository documents a sandbox execution policy, follow it when running
  repository-state-mutating git commands such as staging or committing.
- If the current repository documents hook installation or commit-lint commands, use them.
- Do not invent setup commands or assume a package manager.
- Hook installation and commit-message linting are optional helpers, not part of the core format.
- This skill MAY ship a companion validator script under `scripts/` for hook-based enforcement in
  repositories that adopt this commit profile.

## Operating Contract

- State the outcome first: valid message text, split guidance, validation feedback, or a precise
  reason the policy cannot be applied yet.
- Treat repository-specific rules as higher priority than the default profile below.
- Keep policy ownership narrow. Do not stage files, commit files, install hooks, or run unrelated
  validation unless the invoking workflow explicitly owns that side effect.
- Use concise final output by default. Add rationale only when type, scope, splitting, or breaking
  change handling is not obvious.
- Stop once the message or validation result satisfies the requested contract; do not continue
  exploring alternate valid wordings.

## Success Criteria

- The header matches Conventional Commits grammar and any repository-specific lint rules.
- Type, scope, breaking markers, body, and footers are chosen from the change intent and repository
  evidence.
- Split guidance maps each unit to one logical purpose and rollback boundary.
- Ambiguity is surfaced only when it could change the final message or split.

## Delegation Contract

When another workflow delegates to this skill, it SHOULD pass:

1. Commit intent for a unit, including what changed and why.
2. Scope hints or explicit user constraints.
3. Whether the unit is breaking, risky, or non-trivial enough to justify a body.
4. Any repository-specific commit rules already discovered from local docs or hooks.

This skill SHOULD return:

1. Conventional Commit message text with header, optional body, and optional footers.
2. Warnings when scope or type fit is weak.
3. Warnings when a body or footer would improve clarity for a complex change.

## Canonical Message Structure

Conventional Commits 1.0.0 message format:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Specification Rules (v1.0.0)

Apply these rules when constructing commit messages:

1. Header MUST start with a `type`, then optional `(scope)`, then optional `!`, then `: `.
2. `feat` MUST be used when adding a new feature.
3. `fix` MUST be used when fixing a bug.
4. Description MUST immediately follow `: ` and summarize the change.
5. Body MAY be provided; if present, it MUST begin one blank line after the header.
6. Footers MAY be provided; footer section MUST begin one blank line after body (or header when no
   body).
7. Each footer MUST use a token plus separator (`:<space>` or `<space>#`) and a value.
8. Footer tokens MUST replace spaces with `-` except `BREAKING CHANGE`, which is allowed as-is.
9. Breaking changes MUST be indicated by `!` in the header or a `BREAKING CHANGE: <description>`
   footer.
10. `BREAKING-CHANGE` MUST be treated as synonymous with `BREAKING CHANGE` in footer tokens.
11. Types other than `feat` and `fix` MAY be used.
12. Footer values MAY contain spaces/newlines; parsing stops when the next valid footer
    token/separator pair appears.
13. Commit units MUST be treated as case-insensitive by tooling, except `BREAKING CHANGE` MUST
    remain uppercase.

## Default Commit Profile

Use these stricter style conventions unless the current repository documents its own conventions:

| Rule    | Requirement                                                                               |
| ------- | ----------------------------------------------------------------------------------------- |
| Header  | Use `type(scope): subject` unless no scope is needed                                      |
| Type    | Lowercase token                                                                           |
| Scope   | Optional; short noun, lowercase with hyphens                                              |
| Subject | Imperative phrase, no trailing period                                                     |
| Case    | SHOULD start lowercase; allow required casing for acronyms/proper nouns (`HTTP`, `OAuth`) |
| Length  | SHOULD keep header <=72 chars (allow overflow only when clarity would suffer)             |

### Preferred Types

| Type       | Use When                                                 |
| ---------- | -------------------------------------------------------- |
| `feat`     | Adding new functionality                                 |
| `fix`      | Fixing a bug                                             |
| `docs`     | Documentation only changes                               |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `test`     | Adding or modifying tests                                |
| `perf`     | Performance improvement                                  |
| `style`    | Formatting or style-only changes with no behavior change |
| `build`    | Build system or external dependencies                    |
| `ci`       | CI configuration changes                                 |
| `chore`    | Maintenance tasks, tooling, config                       |
| `revert`   | Reverting a previous commit                              |

Additional types are allowed when they better describe intent and still follow the spec grammar.

When multiple types could fit, prefer the most specific type and avoid defaulting to `chore`.

## Breaking Change Guidance

Use one of the following forms:

```text
feat(auth)!: require api token for admin endpoint
```

```text
feat(auth): require api token for admin endpoint

BREAKING CHANGE: admin endpoint now returns 401 when the token is missing
```

When using `!`, the description SHOULD clearly summarize what broke. Include a
`BREAKING CHANGE: ...` footer as well so tooling and release notes can consume structured detail.

## Scoping and Split Heuristics

Group changes into a single commit when they:

1. Share one logical purpose.
2. Affect the same component or workflow.
3. Should be reverted together.

Split into separate commits when changes:

1. Mix different purposes (example: feature + refactor).
2. Require different types.
3. Target unrelated areas with independent rollback risk.

### Scope Selection

Choose scope by intent rather than exact folder names. If the repository already has stable scope
vocabulary, prefer that over these defaults.

| Situation                   | Suggested Scope                     |
| --------------------------- | ----------------------------------- |
| UI or frontend changes      | `ui` or `web`                       |
| API or service behavior     | `api` or `service`                  |
| CLI or script changes       | `cli` or `scripts`                  |
| Data access or schema work  | `data` or `db`                      |
| Auth or permissions work    | `auth`                              |
| Test-only changes           | `test` or `e2e`                     |
| Tooling, automation, config | `tooling`, `build`, `ci`, or `deps` |
| Cross-cutting work          | omit scope                          |

Prefer short, human-readable scopes that make release notes and review history clearer.

## Message Planning Workflow

1. Inspect the provided change summary, diff, or staged and unstaged changes.
2. Partition changes into logical commit units.
3. Pick type, scope, and breaking-change markers per unit.
4. Write header/body/footers using the rules above.
5. Return warnings only for assumptions that could change the message or split.

## Body and Footer Preferences

- SHOULD include a body for non-trivial commits (`refactor`, `perf`, breaking changes, high-risk
  fixes).
- Body SHOULD explain "what changed" and "why", not just restate the header.
- SHOULD use a consistent issue footer style:
  - `Refs: #123` for related work
  - `Closes: #123` when the commit fully resolves the issue

### Optional Validation

- Run a repository-provided commit lint command only when it exists.
- Do not assume a specific script name or package manager.
- For code changes, run repository-provided validation such as lint or tests when the workflow
  already requires it.

## Examples

```text
fix(api): prevent duplicate webhook delivery
```

```text
refactor(ui): extract action toolbar into a shared component

Moves common action layout into a reusable component used by multiple screens.
```

```text
feat(auth)!: require api token for admin endpoint

BREAKING CHANGE: admin endpoint now returns 401 when the token is missing
Refs: #142
```

## Anti-patterns

| Pattern                      | Problem                      | Fix                                       |
| ---------------------------- | ---------------------------- | ----------------------------------------- |
| `Fix stuff`                  | No type, vague subject       | `fix(api): handle null response`          |
| `feat: Add Feature.`         | Capitalized, trailing period | `feat: add feature`                       |
| `fix(auth): fixed the bug`   | Past tense                   | `fix(auth): handle expired token refresh` |
| `feat(scope)! missing colon` | Invalid header grammar       | `feat(scope)!: describe change`           |
| `BREAKING-CHANGE add api`    | Invalid footer format        | `BREAKING CHANGE: add api`                |
| Mixed purposes               | Hard to revert               | Split into separate commits               |
| Giant commits                | Hard to review               | Break into logical units                  |
