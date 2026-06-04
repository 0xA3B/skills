# Conventional Commits Reference

Use this reference only when detailed specification rules, examples, footer edge cases, or
anti-patterns are needed while creating commits.

Reference specification:

- https://www.conventionalcommits.org/en/v1.0.0/#specification

## Canonical Message Structure

Conventional Commits 1.0.0 message format:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Specification Rules

Apply these rules when constructing commit messages:

1. Header starts with a `type`, then optional `(scope)`, then optional `!`, then `: `.
2. `feat` is used when adding a new feature.
3. `fix` is used when fixing a bug.
4. Description immediately follows `: ` and summarizes the change.
5. Body may be provided; if present, it begins one blank line after the header.
6. Footers may be provided; footer section begins one blank line after body, or after the header
   when no body is present.
7. Each footer uses a token plus separator (`:<space>` or `<space>#`) and a value.
8. Footer tokens replace spaces with `-` except `BREAKING CHANGE`, which is allowed as-is.
9. Breaking changes are indicated by `!` in the header or a `BREAKING CHANGE: <description>` footer.
10. `BREAKING-CHANGE` is synonymous with `BREAKING CHANGE` in footer tokens.
11. Types other than `feat` and `fix` are allowed.
12. Footer values may contain spaces or newlines; parsing stops when the next valid footer
    token/separator pair appears.
13. Commit units are case-insensitive to tooling, except `BREAKING CHANGE` remains uppercase.

## Default Commit Profile

Use these stricter style conventions unless the current repository documents its own conventions:

| Rule    | Requirement                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| Header  | Use `type(scope): subject` unless no scope is needed                               |
| Type    | Lowercase token                                                                    |
| Scope   | Optional; short noun, lowercase with hyphens                                       |
| Subject | Imperative phrase, no trailing period                                              |
| Case    | Start lowercase; allow required casing for acronyms/proper nouns (`HTTP`, `OAuth`) |
| Length  | Keep header <=72 chars when practical                                              |

## Preferred Types

| Type       | Use When                                                 |
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

## Breaking Change Guidance

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

## Scope Selection

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

## Body and Footer Preferences

- Include a body for non-trivial commits such as refactors, performance changes, breaking changes,
  or high-risk fixes.
- Body should explain what changed and why, not just restate the header.
- Use a consistent issue footer style when the repository does not define one:
  - `Refs: #123` for related work
  - `Closes: #123` when the commit fully resolves the issue

## Anti-Patterns

| Pattern                      | Problem                      | Fix                                       |
| ---------------------------- | ---------------------------- | ----------------------------------------- |
| `Fix stuff`                  | No type, vague subject       | `fix(api): handle null response`          |
| `feat: Add Feature.`         | Capitalized, trailing period | `feat: add feature`                       |
| `fix(auth): fixed the bug`   | Past tense                   | `fix(auth): handle expired token refresh` |
| `feat(scope)! missing colon` | Invalid header grammar       | `feat(scope)!: describe change`           |
| `BREAKING-CHANGE add api`    | Invalid footer format        | `BREAKING CHANGE: add api`                |
| Mixed purposes               | Hard to revert               | Split into separate commits               |
| Giant commits                | Hard to review               | Break into logical units                  |
