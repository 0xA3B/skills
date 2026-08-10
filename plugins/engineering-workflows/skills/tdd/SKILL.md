---
name: tdd
description: >-
  Build features or fix bugs with a red-green-refactor loop. Use when the user explicitly asks for
  TDD, red-green-refactor, test-first development, or wants behavior implemented through tests.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/tdd
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
  upstream_divergence: refactor stays in the loop; test seams chosen autonomously, not pre-agreed
disable-model-invocation: true
argument-hint: "[task]"
---

# Test-driven development

Use a red-green-refactor loop with vertical slices. Verify behavior through public interfaces, not
implementation details.

## Outcome

Deliver the requested behavior through a sequence of small red-green-refactor cycles. The final code
should have behavior-focused tests at the public interface, minimal speculative design, and relevant
project validation passing.

## Allowed side effects

- Edit production code and tests needed for the current behavior.
- Reuse existing fixtures, helpers, and project commands.
- Refactor touched code after a passing test proves behavior, while keeping behavior unchanged.
- Do not broaden the task into unrelated cleanup or architecture work unless the user asks.

## Philosophy

Good tests are integration-style where practical: they exercise real code paths through public
interfaces and describe what the system does. They survive refactors because they do not care about
private structure.

Bad tests couple to implementation details: private methods, internal collaborators, incidental data
shape, or mocks that mirror the current implementation. The warning sign is a test that fails during
a harmless refactor but misses real behavior breakage.

Tautological tests recompute the expected value through the same logic as production, so they pass
by construction; take expected values from an independent authority instead.

Test your composition of a framework's guarantees, not the guarantees themselves. A test that
re-proves what the validation library already enforces — unknown keys rejected, empty strings
rejected — adds volume without adding coverage.

Read [tests.md](references/tests.md) before writing a test whose expected value is computed rather
than known, or when a test asserts on calls rather than results. Reference examples may use
TypeScript; apply the testing principles in the repository's actual language and test framework.

## Tracer bullets

Do not treat RED as "write every test" and GREEN as "write all the code." That produces tests for
imagined behavior before the implementation teaches you anything.

Prefer tracer bullets:

```text
RED: write one failing behavior test
GREEN: implement the smallest code path that passes
REFACTOR: improve names, structure, and tests without changing behavior
repeat
```

Each slice should respond to what the previous cycle revealed.

## Spec-driven rounds

Serial tracer bullets assume the design is emerging from the cycles. A complete spec inverts that:
when an authoritative spec with enumerable acceptance criteria governs the work, slice by acceptance
criterion and work in rounds instead of one slice at a time.

The **frontier** is every acceptance criterion whose prerequisite interfaces and behaviors are
already settled. Each round:

1. RED: write one failing test per frontier criterion, confirming each fails for its predicted
   reason.
2. GREEN: implement criterion by criterion until the round's tests pass.
3. REFACTOR: run one refactor pass over the whole round.
4. Settled criteria push the frontier outward. Recompute it and start the next round.

Criteria that are silent, ambiguous, or contradictory mark where design work remains: keep them out
of rounds and resolve them as serial tracer bullets, or surface them as user decisions when the
answer is not derivable from the spec.

## Discipline checks

Tests written after implementation are useful regression coverage, but they are not TDD. Do not
claim a slice followed red-green-refactor unless the test failed for the expected reason before the
implementation existed.

When implementation code is written before RED during this workflow, stop the slice and recover
without destroying user work:

- If the untested code is yours and safe to discard, set it aside or revert that slice, then write
  the failing behavior test first.
- If the code is user-authored or unsafe to discard, leave it intact and be explicit that the next
  work is adding characterization or regression coverage, not continuing a pure TDD cycle.
- Do not adapt the implementation-shaped test to fit code that already exists. Tighten the public
  behavior expectation first, then change code only to satisfy that expectation.

Watch for rationalizations:

- "This is too small to test."
- "I'll write the tests right after."
- "The test would be obvious."
- "Manual testing proves the same thing."
- "This is just a refactor, so RED does not matter."

These are signals to reduce the slice size, find a cheaper seam, or — when test-first work is the
wrong feedback loop for this task — stop and recommend an explicit invocation of
`engineering-workflows:build`.

## Workflow

### 1. Plan the test surface

Before editing, inspect the relevant code, tests, docs, and project commands. Keep domain names
aligned with `AGENTS.md ## Terminology` when present.

Identify:

- The public interface or user-visible behavior to test.
- The smallest first behavior that proves the path works. Prefer a first slice that crosses an
  unfamiliar third-party or environment boundary: that is where the mental model is most likely
  wrong and where the correction is cheapest.
- Existing test patterns and fixtures to reuse.
- Opportunities for deep modules with simple interfaces.
- The validation command that will run quickly in the loop.

When the interface or behavior priority is ambiguous, state the assumption and proceed if low risk;
ask the user to choose only when the wrong choice would waste work or lock in the wrong interface.

Apply `engineering-workflows:codebase-design` when the interface, seam, module depth, or test
surface needs design.

### 2. Red

Write one failing test for one behavior.

When an authoritative spec exists, quote the governing spec sentence in the test's name, docstring,
or a comment, so the authority is visible at the point of assertion. If the test and the spec
disagree, the spec wins and the test changes; never adjust the spec to match a test you already
wrote. A criterion with no quotable sentence is a gap to surface, not a license to improvise.

Before running the test, state the failure you expect — ideally the exact assertion or exception
text. Then run it and compare. A failure that does not match the prediction is information, whether
or not the test is red: a syntax error, missing setup, or wrong assertion is not the expected
failure. If the test passes, it is not proving the missing behavior. Tighten it before writing
implementation.

### 3. Green

Write the smallest implementation that makes the test pass. Avoid speculative generalization.

Run the targeted test until it passes. If unrelated tests fail, stop and understand whether the
green step exposed a real regression before moving on.

### 4. Refactor

Improve the code and tests while keeping behavior unchanged:

- Remove duplication introduced by the green step.
- Improve names and module shape.
- Move behavior behind a better interface when the current shape is shallow.
- Move logic to where its data lives, and replace repeated primitives with a value object.
- Keep tests focused on behavior.
- Delete or merge tests the current work has subsumed, judged by the deletion test: if this test
  were deleted, what defect would now ship? A test that no longer discriminates any behavior is a
  legitimate deletion, not lost coverage. Instead of chasing cross-file subsumption mid-slice, note
  it in the completion report and recommend an explicit
  `engineering-workflows:improve-codebase-tests` invocation.
- Report existing code the new code reveals as problematic; change it only when the user asks.

### 5. Repeat

Add the next behavior only after the current test passes and the code is clean enough to continue.
Each new behavior should be a thin vertical slice.

## Mocking

Mock at system boundaries only: external APIs, databases, the clock, randomness, and the file
system. Test internal collaborators through the public interface. Read
[mocking.md](references/mocking.md) before faking anything a slice touches.

## Completion

When the requested behavior is implemented:

- Run the full relevant validation for the touched area.
- Report the red-green-refactor sequence at a high level.
- Name the tests added or changed.
- Note any behavior that remains intentionally untested and why.
- State validation evidence from fresh command output. Avoid success claims based on expectation or
  earlier runs.
- For spec-driven work, state that the green suite encodes this session's reading of the spec and is
  not evidence of spec conformance, and recommend an explicit `engineering-workflows:review-changes`
  or `engineering-workflows:review-branch` invocation with the spec-adherence and test-review lanes.

Stop when the requested behavior is implemented and validation passes, or when the next slice is
blocked by an ambiguous interface, missing dependency, or failing project setup that cannot be
resolved from local evidence.
