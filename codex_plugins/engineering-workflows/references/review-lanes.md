# Review Lanes

Use review lanes to separate review intent from review scope. The invoking skill owns scope; this
reference owns the shared lane contract.

## Required Lanes

Run at least two review lanes over the same target:

- `simplification`: reuse, simplification, efficiency, and altitude.
- `code review`: correctness, edge cases, reliability, security, compatibility, test coverage, and
  plan or spec adherence when applicable.

Break out additional lanes when size or risk justifies it, such as security, migration,
compatibility, test coverage, removed-behavior auditing, or spec adherence.

## Finding Shape

Use `review-finding.schema.json` for reviewer-to-agent output when available. If the shared schema
cannot be read, require each lane to return `lane`, `verdict`, `summary`, and findings with `id`,
`severity`, `file`, optional lines, `summary`, `evidence`, `impact`, `recommendation`, `confidence`,
and optional `follow_up_question`.

Use lane-distinct finding IDs so merged results stay unambiguous. Suggested prefixes:

- `SIM1`, `SIM2`, ... for simplification.
- `CR1`, `CR2`, ... for code review.
- A short uppercase lane prefix for extra lanes, such as `SEC1` or `TEST1`.

If an external reviewer uses a different schema or ID pattern, the coordinator normalizes findings
to the shared fields and assigns distinct IDs before deduping or presenting findings.

## Simplification Lane

Look for maintainability findings that can be fixed without changing intended behavior:

- new code that re-implements existing helpers or local patterns;
- redundant state, copy-paste variation, deep nesting, or dead code;
- repeated computation, repeated I/O, unnecessary sequencing, or hot-path/startup cost;
- wrong altitude: caller-side invariants, local special cases, shallow pass-through wrappers,
  duplicated policy, or tests forced through implementation details.

Use the architecture language from `improve-codebase-architecture`: module depth, interface, seam,
locality, leverage, and testability. Prefer deeper modules, simpler public interfaces, better seams,
and behavior-tested boundaries. Defer broad architecture redesign to
`engineering-workflows:improve-codebase-architecture`.

## Code Review Lane

Look for material issues that could make the change wrong or unsafe:

- correctness bugs, edge cases, regressions, and removed behavior;
- reliability, concurrency, compatibility, migration, security, or data-safety risks;
- missing or weak tests for changed behavior;
- mismatch with an applicable plan, spec, or user request.

Avoid generic style feedback and unrelated codebase audits.
