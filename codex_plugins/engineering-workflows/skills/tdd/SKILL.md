---
name: tdd
description: >-
  Build features or fix bugs with a red-green-refactor loop. Use when the user explicitly asks for
  TDD, red-green-refactor, test-first development, or wants behavior implemented through tests.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/tdd
---

# Test-Driven Development

Use a red-green-refactor loop with vertical slices. Tests should verify behavior through public
interfaces, not implementation details.

## Outcome

Deliver the requested behavior through a sequence of small red-green-refactor cycles. The final code
should have behavior-focused tests at the public interface, minimal speculative design, and relevant
project validation passing.

## Allowed Side Effects

- Edit production code and tests needed for the current behavior.
- Reuse existing fixtures, helpers, and project commands.
- Refactor touched code after a passing test proves behavior, while keeping behavior unchanged.
- Do not broaden the task into unrelated cleanup or architecture work unless the user asks.

## Philosophy

Good tests are integration-style where practical: they exercise real code paths through public APIs
and describe what the system does. They survive refactors because they do not care about private
structure.

Bad tests couple to implementation details: private methods, internal collaborators, incidental data
shape, or mocks that mirror the current implementation. The warning sign is a test that fails during
a harmless refactor but misses real behavior breakage.

Use [tests.md](references/tests.md) for examples and [mocking.md](references/mocking.md) for mocking
guidance.

## Avoid Horizontal Slices

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

## Workflow

### 1. Plan The Test Surface

Before editing, inspect the relevant code, tests, docs, and project commands. Use the project's
domain language from `AGENTS.md`, README files, nearby docs, and code names.

Identify:

- The public interface or user-visible behavior to test.
- The smallest first behavior that proves the path works.
- Existing test patterns and fixtures to reuse.
- Opportunities for deep modules with simple interfaces.
- The validation command that will run quickly in the loop.

When the interface or behavior priority is ambiguous, ask the user to choose. When it is clear,
state the assumption and proceed.

Use [interface-design.md](references/interface-design.md) and
[deep-modules.md](references/deep-modules.md) when the interface itself needs design.

### 2. Red

Write one failing test for one behavior.

Run the targeted test and confirm it fails for the expected reason. If it passes, the test is not
proving the missing behavior. Tighten it before writing implementation.

### 3. Green

Write the smallest implementation that makes the test pass. Avoid speculative generalization.

Run the targeted test until it passes.

### 4. Refactor

Improve the code and tests while keeping behavior unchanged:

- Remove duplication introduced by the green step.
- Improve names and module shape.
- Move behavior behind a better interface when the current shape is shallow.
- Keep tests focused on behavior.

Use [refactoring.md](references/refactoring.md) for detailed refactoring guidance.

### 5. Repeat

Add the next behavior only after the current test passes and the code is clean enough to continue.
Each new behavior should be a thin vertical slice.

## Mocking

Mock only at real external boundaries or slow/unstable dependencies. Do not mock internal modules to
make implementation-shaped tests easier. Use [mocking.md](references/mocking.md) when choosing what
to fake.

Reference examples may use TypeScript, but apply the testing principles in the repository's actual
language and test framework.

## Completion

When the requested behavior is implemented:

- Run the full relevant validation for the touched area.
- Report the red-green-refactor sequence at a high level.
- Name the tests added or changed.
- Note any behavior that remains intentionally untested and why.

Stop when the requested behavior is implemented and validation passes, or when the next slice is
blocked by an ambiguous interface, missing dependency, or failing project setup that cannot be
resolved from local evidence.
