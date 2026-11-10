# Conventional Commits reference

Specification: <https://www.conventionalcommits.org/en/v1.0.0/#specification>

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Specification rules

1. Start the header with a `type`, then an optional `(scope)`, then an optional `!`, then `: ` and
   the description.
2. Start a body one blank line after the header.
3. Start the footers one blank line after the body, or after the header when there is no body.
4. Write each footer as a token, a separator (`: ` or ` #`), and a value. Replace spaces in a token
   with `-`; `BREAKING CHANGE` is the one token allowed with a space, and `BREAKING-CHANGE` is its
   synonym.
5. A footer value may contain spaces and newlines; it ends where the next token and separator begin.
6. Mark a breaking change with `!` in the header, a `BREAKING CHANGE: <description>` footer, or
   both.

## Default profile

Use this profile unless the repository documents its own:

- **Header.** `type(scope): subject`, or `type: subject` when no scope fits. Keep it within 72
  characters when practical.
- **Type and scope.** Lowercase; the scope is a short noun with hyphens. Omit the scope for
  cross-cutting work.
- **Subject.** An imperative phrase that starts lowercase, except for an acronym or a proper noun
  such as `HTTP` or `OAuth`, and ends without a period.

## Types

| Type       | Use when                                                 |
| ---------- | -------------------------------------------------------- |
| `feat`     | Adding functionality                                     |
| `fix`      | Fixing a bug                                             |
| `docs`     | Documentation-only changes                               |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `test`     | Adding or changing tests                                 |
| `perf`     | Performance improvement                                  |
| `style`    | Formatting or style-only changes with no behavior change |
| `build`    | Build system or external dependencies                    |
| `ci`       | CI configuration changes                                 |
| `chore`    | Maintenance, tooling, or configuration                   |
| `revert`   | Reverting an earlier commit                              |

Another type is allowed when it describes the intent better and follows the grammar. When several
types fit, choose the most specific one over `chore`.

## Breaking changes

```text
feat(auth)!: require api token for admin endpoint
```

```text
feat(auth): require api token for admin endpoint

BREAKING CHANGE: admin endpoint now returns 401 when the token is missing
```

With `!`, the description states what broke. Add the footer as well when release tooling, release
notes, or reviewers need the detail in a structured place.

## Bodies and footers

- Write a body when the reason, a constraint, a migration choice, a compatibility boundary, or a
  deliberate omission would otherwise be lost.
- When the repository defines no issue footer style, use `Refs: #123` or `Refs: PROJ-123` for a
  commit with a durable relationship to the work, and `Closes: #123` only when the commit alone
  resolves the issue and closing it from the commit is intended.

## Corrected examples

| Message                      | Problem                      | Corrected                                 |
| ---------------------------- | ---------------------------- | ----------------------------------------- |
| `Fix stuff`                  | No type, vague subject       | `fix(api): handle null response`          |
| `feat: Add Feature.`         | Capitalized, trailing period | `feat: add feature`                       |
| `fix(auth): fixed the bug`   | Past tense, names no result  | `fix(auth): handle expired token refresh` |
| `feat(scope)! missing colon` | Invalid header grammar       | `feat(scope)!: describe change`           |
| `BREAKING-CHANGE add api`    | Footer lacks its separator   | `BREAKING CHANGE: add api`                |
