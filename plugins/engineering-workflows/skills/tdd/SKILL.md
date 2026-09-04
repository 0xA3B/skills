---
name: tdd
description: >-
  Use when implementing or changing behavior that callers or users can observe: a new feature, a
  behavior change, a bug fix whose cause is known, a port from a reference implementation, or a new
  or changed public interface or seam. Drives the work through a red-green-refactor loop over a
  frontier of behaviors, with tests at the public interface. Do not use for changes with no behavior
  to prove, such as configuration, documentation, formatting, or mechanical renames; for disposable
  prototypes or spikes; for a bug whose cause is still unknown, which needs diagnosis first; for
  reviewing existing changes; or for conceptual questions about TDD.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/tdd
  upstream_reviewed: 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e
  upstream_divergence: >-
    the loop runs over a frontier of behaviors instead of one test at a time; refactor runs once per
    frontier over production and test code; test seams chosen autonomously, not pre-agreed
argument-hint: "[task]"
---

# Test-driven development

Implement behavior through a red-green-refactor loop over a frontier of behaviors. Verify behavior
through public interfaces, not implementation details.

## Outcome

Deliver the requested behavior through a sequence of frontier cycles. The final code has
behavior-focused tests at the public interface, minimal speculative design, test code refactored
alongside the production code, and relevant project validation passing.

## Allowed side effects

- Edit production code and tests needed for the current behavior.
- Reuse existing fixtures, helpers, and project commands.
- Refactor the production and test code the current work touched, keeping behavior unchanged.
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

Read [tests.md](references/tests.md) before the first test of a session, and again before writing a
test whose expected value is computed rather than known, that asserts on calls rather than results,
or that enumerates the contents of a collection. Reference examples may use TypeScript; apply the
testing principles in the repository's actual language and test framework.

## The frontier

The unit of the loop is the frontier: every behavior whose prerequisite interfaces and behaviors are
settled and whose test failure can be attributed independently of the others. Each cycle:

```text
RED: write one failing test per frontier behavior, each failing for its predicted reason
GREEN: implement behavior by behavior with the smallest code that passes
REFACTOR: run one pass over the frontier's production and test code
recompute the frontier and repeat
```

The frontier's size follows the source of behavior:

- When the design is emerging from the work, the frontier is one behavior: a tracer bullet. Do not
  treat RED as "write every test" and GREEN as "write all the code"; that produces tests for
  imagined behavior before the implementation teaches you anything. Each tracer bullet responds to
  what the previous cycle revealed.
- When an authoritative behavior source governs the work — a spec with acceptance criteria, or a
  reference implementation and its tests for a port — the frontier is every settled criterion, and
  the work proceeds in rounds. If the source is not already enumerated, inventory its public
  behaviors, diagnostics, and tests first so the frontier is computable, and record each intentional
  difference as you find it.

Split the frontier when part of it fails the bound. When failures could not be attributed
independently, or when GREEN for a criterion needs an unresolved design decision, resolve that part
as a serial tracer bullet, or surface it as a user decision when the answer is not derivable from
the source. Criteria that are silent, ambiguous, or contradictory mark where design work remains;
keep them out of rounds. Continue the remaining independent work in the round.

## Discipline checks

Tests written after implementation are useful regression coverage, but they are not TDD. Do not
claim a behavior followed red-green-refactor unless its test failed for the expected reason before
the implementation existed.

When implementation code is written before RED during this workflow, stop and recover without
destroying user work:

- If the untested code is yours, isolated, and cheap to set aside, set it aside or revert it, then
  write the failing behavior test first.
- If the code is user-authored, coupled to a coherent implementation, or unsafe to discard, leave it
  intact and be explicit that the next work is adding characterization or regression coverage, not
  continuing a pure TDD cycle.
- Do not adapt the implementation-shaped test to fit code that already exists. Tighten the public
  behavior expectation first, then change code only to satisfy that expectation.

Watch for rationalizations:

- "This is too small to test."
- "I'll write the tests right after."
- "The test would be obvious."
- "Manual testing proves the same thing."
- "This is just a refactor, so RED does not matter."

These are signals to reduce the frontier to one tracer bullet or find a cheaper seam. When the
interface is still unsettled, put the first tests at the outermost stable surface — a command, an
endpoint, a file, or an artifact — and let internals move under them. When the code is disposable
evidence for a design question rather than behavior that will land, stop and recommend an explicit
invocation of `engineering-workflows:prototype`.

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

Write one failing test per frontier behavior.

When an authoritative spec exists, quote the governing spec sentence in the test's name, docstring,
or a comment, so the authority is visible at the point of assertion. If the test and the spec
disagree, the spec wins and the test changes; never adjust the spec to match a test you already
wrote. A criterion with no quotable sentence is a gap to surface, not a license to improvise.

Before running a test, record the failure you expect — ideally the exact assertion or exception
text. Then run it and compare. A failure that does not match the prediction is information, whether
or not the test is red: a syntax error, missing setup, or wrong assertion is not the expected
failure. If the test passes, it is not proving the missing behavior. Tighten it before writing
implementation.

Report frontier transitions, unexpected failures, and design changes to the user. Do not narrate
routine cycles.

### 3. Green

Write the smallest implementation that makes each test pass, behavior by behavior. Avoid speculative
generalization.

Run the targeted tests until they pass. If unrelated tests fail, stop and understand whether the
green step exposed a real regression before moving on.

### 4. Refactor

After the frontier is green, refactor the production and test code together while keeping behavior
unchanged and the suite green:

- Remove duplication introduced by the green step.
- Improve names and module shape. Move behavior behind a better interface when the current shape is
  shallow, move logic to where its data lives, and replace repeated primitives with a value object.
- Review the tests added in this cycle and the tests they build on. Delete or merge tests that no
  longer discriminate behavior, judged by the deletion test: if this test were deleted, what defect
  would now ship? A test that discriminates nothing is a legitimate deletion, not lost coverage.
- Keep setup explicit while the behavior and data shape are still emerging. Extract a domain-named
  helper only once repeated setup represents a settled concept, and parameterize only cases that
  share behavior, setup shape, and failure meaning.
- Report existing code the new code reveals as problematic; change it only when the user asks.

This workflow owns the production and test code it introduced or materially changed, including
across touched files. Hand off only pre-existing test debt outside the touched surface: note it in
the completion report and recommend an explicit `engineering-workflows:improve-codebase-tests`
invocation.

The refactor pass is complete when the frontier's production code and test code have each been
considered and either changed or recorded as needing no change, and the suite is green. Do not start
the next RED before then.

### 5. Repeat

Settled behaviors push the frontier outward. Recompute it and start the next cycle only after the
refactor pass is complete.

## Mocking

Mock at system boundaries only: external APIs, databases, the clock, randomness, and the file
system. Test internal collaborators through the public interface. Read
[mocking.md](references/mocking.md) before faking anything a cycle touches.

## Completion

When the requested behavior is implemented:

- Run the full relevant validation for the touched area.
- Report the red-green-refactor sequence at a high level.
- Name the tests added, changed, or removed.
- Note any behavior that remains intentionally untested and why.
- State validation evidence from fresh command output. Avoid success claims based on expectation or
  earlier runs.
- For a port, state that every inventory item is settled or recorded as an intentional difference.
- For spec-driven work, state that the green suite encodes this session's reading of the spec and is
  not evidence of spec conformance, and recommend an explicit `engineering-workflows:review-changes`
  or `engineering-workflows:review-branch` invocation with the spec-adherence and test-review lanes.

Stop when the requested behavior is implemented and validation passes, or when the next frontier is
blocked by an ambiguous interface, missing dependency, or failing project setup that cannot be
resolved from local evidence.
