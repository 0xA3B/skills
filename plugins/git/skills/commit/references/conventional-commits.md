# Conventional commits reference

Reference specification:

- https://www.conventionalcommits.org/en/v1.0.0/#specification

## Canonical message structure

Conventional Commits 1.0.0 message format:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Specification rules

Apply these rules when constructing commit messages:

1. Start the header with a `type`, then optional `(scope)`, then optional `!`, then `: `.
2. Put the description immediately after `: ` and summarize the change in it.
3. When you write a body, start it one blank line after the header.
4. When you write footers, start the footer section one blank line after the body, or after the
   header when no body is present.
5. Write each footer as a token plus separator (`:<space>` or `<space>#`) and a value.
6. Replace spaces in footer tokens with `-`; `BREAKING CHANGE` is the one token allowed as-is.
7. Mark a breaking change with `!` in the header or a `BREAKING CHANGE: <description>` footer.
8. Treat `BREAKING-CHANGE` as synonymous with `BREAKING CHANGE` in footer tokens.
9. Footer values may contain spaces and newlines; a footer ends when the next valid footer
   token/separator pair appears.

## Default commit profile

Use these stricter style conventions unless the current repository documents its own conventions:

| Rule    | Requirement                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| Header  | Use `type(scope): subject` unless no scope is needed                               |
| Type    | Lowercase token                                                                    |
| Scope   | Optional; short noun, lowercase with hyphens                                       |
| Subject | Imperative phrase, no trailing period                                              |
| Case    | Start lowercase; allow required casing for acronyms/proper nouns (`HTTP`, `OAuth`) |
| Length  | Keep header <=72 chars when practical                                              |

## Preferred types

| Type       | Use when                                                 |
| ---------- | -------------------------------------------------------- |
| `feat`     | Adding new functionality                                 |
| `fix`      | Fixing a bug                                             |
| `docs`     | Documentation-only changes                               |
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

## Breaking change guidance

Use one of the following forms:

```text
feat(auth)!: require api token for admin endpoint
```

```text
feat(auth): require api token for admin endpoint

BREAKING CHANGE: admin endpoint now returns 401 when the token is missing
```

When using `!`, the description should clearly summarize what broke. Include a
`BREAKING CHANGE: ...` footer as well when tooling, release notes, or reviewers need structured
detail.

## Scope selection

| Situation                   | Suggested scope                     |
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

## Body and footer preferences

- Add a body when the reason, constraint, migration choice, compatibility boundary, or deliberate
  omission would otherwise be lost. Explain why the change exists and what future maintainers must
  preserve; do not inventory the diff.
- Use a consistent issue footer style when the repository does not define one:
  - `Refs: #123` or `Refs: PROJ-123` when the commit has a durable relationship to the work.
  - `Closes: #123` only when the commit independently resolves the issue and commit-level closure is
    intentional.
- Keep issue and ticket identifiers out of the subject unless repository policy requires them. Do
  not repeat a change request's overall reference on each commit.

## Anti-patterns

| Pattern                      | Problem                      | Fix                                       |
| ---------------------------- | ---------------------------- | ----------------------------------------- |
| `Fix stuff`                  | No type, vague subject       | `fix(api): handle null response`          |
| `feat: Add Feature.`         | Capitalized, trailing period | `feat: add feature`                       |
| `fix(auth): fixed the bug`   | Past tense                   | `fix(auth): handle expired token refresh` |
| `feat(scope)! missing colon` | Invalid header grammar       | `feat(scope)!: describe change`           |
| `BREAKING-CHANGE add api`    | Invalid footer format        | `BREAKING CHANGE: add api`                |
