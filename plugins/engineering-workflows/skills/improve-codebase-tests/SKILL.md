---
name: improve-codebase-tests
description: >-
  Find evidence-backed test-suite improvement opportunities in a codebase. Use when the user wants
  the test suite treated as a codebase: flaky or slow suites, scaffold and fixture design, mock
  strategy drift, subsumed or low-value tests, or a focused test-suite health review. Do not use for
  reviewing the tests of a single diff or branch, which belongs to the test-review lane of a code
  review.
license: MIT
metadata:
  original_author: Alex Baker
disable-model-invocation: true
argument-hint: "[scope]"
---

# Improve codebase tests

Find test-suite friction and propose improvements: changes that make the suite cheaper to run, read,
and maintain while keeping every behavior worth proving proven.

Load `engineering-workflows:codebase-design` before scanning and apply it to test code throughout:
helpers and fixtures are modules with interfaces and depth like anything else.

## Outcome

Produce a prioritized, repository-grounded test-suite review or a concrete plan for one selected
improvement. The first pass is analysis-only unless the user explicitly requests implementation.

## Two costs

Test-maintenance cost has two components with separate remedies; classify every candidate by which
cost it addresses:

- **Brittleness**: tests break when internals change. Remedied by moving tests to stable contracts
  and faking at real seams.
- **Volume**: sheer count to read, run, and carry. Remedied by deletion and merging — and worsened,
  not fixed, by seam-shaped remedies, because every case driven through a wide outer seam pays full
  setup.

A seam-shaped suite can still be a volume problem. TDD-built suites are the highest-yield targets:
every red-green-refactor cycle adds a test, and per-slice pruning cannot see cross-file subsumption,
so verification residue accumulates structurally.

## Scope before scanning

Test improvement pays off where tests cost the most. Choose the review area before searching:

1. Use the suite, path, or pain point named by the user.
2. Use deferred suite-level findings from earlier test-review lane runs when the repository has
   them.
3. Otherwise find hot spots from evidence: slowest files, flake history (CI retries, `.skip` and
   `.todo` accretion, timing constants), test files changed in most commits, and test files
   repeatedly broken by unrelated changes.
4. When no such history is available, generate the evidence before nominating hot spots: time the
   suite, and run it two or three times to surface nondeterminism.

Widen only when the friction traces to a shared scaffold or a missing production seam.

## Friction signals

Tie every candidate to evidence for one of:

- a test that cannot fail for a reason a user cares about: it asserts mock wiring, private
  structure, or incidental strings such as generated names or paths;
- verification residue: a test added to prove one past change whose coverage stronger tests now
  provide — judge by the deletion test: if this test were deleted, what defect would now ship?
- mock-heavy setup that restates the implementation, so the test passes when the code and the mocks
  are wrong together;
- shared mutable fixtures or ambient state coupling tests to execution order;
- timing or concurrency assertions with no deterministic seam: sleeps, wall-clock bounds,
  max-parallelism counters;
- scaffold duplication across files that hides which setup differences are meaningful;
- one production change repeatedly forcing edits across many test files;
- a helper or fixture module grown ad hoc with no owned interface.

Coverage percentage and test-to-source ratio are not friction signals and not goals; both are
tempting and uninformative. The signal is unproven behavior with a nameable failure scenario, or
proven behavior paying an evidenced cost.

## Present candidates

For each candidate include:

- files, suites, and helpers involved;
- observed friction and evidence, with command output where a run demonstrates it;
- the proposed change in plain language and whether it targets brittleness or volume;
- what coverage is lost, kept, or strengthened — deletion is a first-class candidate outcome, not a
  failure;
- the expected effect on suite runtime and flake surface when that is the friction;
- approximate size, the specific future change made cheaper, and risks.

Ask which candidate the user wants to explore or implement. Treat every candidate that deletes or
weakens a test as a gated user decision: it changes what the suite proves.

## Resolve a selected candidate

For the selected candidate, make explicit:

- the behavior the surviving tests must keep proving;
- the test seam: what is faked and at which boundary. Fake at process, network, clock, and
  filesystem edges; attach tests at stable contracts, whatever their visibility. A private module
  with a settled interface is a legitimate test target; a public surface still in motion is not made
  stable by being public.
- helper and fixture interface changes;
- for merges into table-driven tests: collapse cases that differ only in data; keep named tests for
  cases that differ in behavior, because their names and docstrings carry information a table row
  destroys;
- whether the remedy is actually a production seam. When bad tests are downstream of a missing
  production interface, stop and recommend an explicit
  `engineering-workflows:improve-codebase-architecture` invocation instead of patching the tests in
  place.

## Completion

Demonstrate each claimed benefit before finishing: a formerly flaky test now deterministic across
repeated runs, a measured suite-runtime delta, or a deleted test with a written statement of why
nothing user-visible is now unproven. A benefit that cannot be demonstrated is a risk to report, not
a result.

Record declined and deferred candidates with their evidence in the repository's ignored scratch
directory, confirming the path is ignored with `git check-ignore` before writing. When no ignored
convention exists, record them in the final response instead.

## Boundaries

- Diff-scoped test findings belong to the test-review lane inside
  `engineering-workflows:reviewing-code`; this skill is codebase-scoped.
- Do not manufacture repository-wide candidates when the pain is one suite.
