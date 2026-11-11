# Conventional Commits reference

Specification: <https://www.conventionalcommits.org/en/v1.0.0/#specification>

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Specification rules

1. Write each footer as a token, a separator (`: ` or ` #`), and a value. Replace spaces in a token
   with `-`; `BREAKING CHANGE` is the one token allowed with a space, and `BREAKING-CHANGE` is its
   synonym.
2. A footer value may contain spaces and newlines; it ends where the next token and separator begin.
3. Mark a breaking change with `!` in the header, a `BREAKING CHANGE: <description>` footer, or
   both.

## Types

- `feat`: adding functionality.
- `fix`: fixing a bug.
- `docs`: documentation-only changes.
- `refactor`: code change that neither fixes a bug nor adds a feature.
- `test`: adding or changing tests.
- `perf`: performance improvement.
- `style`: formatting or style-only changes with no behavior change.
- `build`: build system or external dependencies.
- `ci`: CI configuration changes.
- `chore`: maintenance, tooling, or configuration.
- `revert`: reverting an earlier commit.

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

## Footers

When the repository defines no issue footer style, use `Refs: #123` or `Refs: PROJ-123` for a commit
with a durable relationship to the work, and `Closes: #123` only when the commit alone resolves the
issue and closing it from the commit is intended.

## Corrected examples

Each line gives a message, its corrected form, and the problem:

- `Fix stuff` becomes `fix(api): handle null response`: no type, vague subject.
- `feat: Add Feature.` becomes `feat: add feature`: capitalized, trailing period.
- `fix(auth): fixed the bug` becomes `fix(auth): handle expired token refresh`: past tense, names no
  result.
- `feat(scope)! missing colon` becomes `feat(scope)!: describe change`: invalid header grammar.
- `BREAKING-CHANGE add api` becomes `BREAKING-CHANGE: add api`: footer lacks its separator.
