---
name: build
description: >-
  Build features, scripts, tools, or greenfield projects with a pragmatic vertical-slice loop when
  strict test-first development would lock in unstable interfaces too early. Use when the user wants
  implementation with real execution evidence, lightweight validation, and architecture discipline
  without requiring a red-green-refactor contract.
license: MIT
metadata:
  original_author: Alex Baker
---

# Build

Implement through small working slices when the right interface or architecture is still emerging.
This skill is not anti-test: it defers tests until they protect stable behavior or cheap regression
coverage.

## Outcome

Deliver the requested behavior with credible execution evidence, relevant validation, and code
shaped toward deep modules and simple public interfaces. Minimize test churn while the design is
still settling.

## When To Use

Use `engineering-workflows:build` when the primary risk is choosing the wrong shape too early:

- greenfield apps, scripts, CLIs, tools, or prototypes
- unstable interfaces or unclear module boundaries
- high expected refactor churn
- test setup would dominate the useful feedback loop
- representative input, a smoke run, or a real workflow is the best early signal

Use `engineering-workflows:tdd` when the primary risk is breaking known behavior: mature projects,
bug fixes, stable public seams, or well-defined behavior that should be test-first.

## Allowed Side Effects

- Edit production code, tests, fixtures, scripts, and docs needed for the requested behavior.
- Add lightweight validation such as smoke scripts, sample inputs, CLI examples, golden fixtures, or
  focused tests when they now protect stable behavior.
- Refactor touched code after a working slice proves the shape.
- Do not broaden into unrelated cleanup, architecture review, or test-harness investment unless the
  user asks.

## Architecture Rules

Build loosely on test timing, not on design quality.

- Treat a **module** as anything with an interface and an implementation.
- Treat the **interface** as everything a caller must know: types, invariants, error modes,
  ordering, configuration, and command behavior.
- Prefer **deep modules**: a small interface that hides useful behavior. Avoid shallow modules that
  expose nearly as much complexity as they hide.
- Use **seams** where behavior may need to change without editing callers in place.
- Add **adapters** at real external boundaries, not just because an abstraction might be useful
  someday.
- Prefer small vertical slices that produce a runnable result.
- Define the smallest useful public interface or command surface before wiring internals.
- Keep interfaces easy to change until they prove useful.
- Avoid shallow pass-through modules; move behavior behind interfaces that simplify callers.
- Use real seams for external systems, slow dependencies, filesystem boundaries, network calls, and
  process execution.
- Keep domain names aligned with `AGENTS.md ## Glossary` when present.

If interface or module shape becomes the main risk, pause and use
`engineering-workflows:improve-codebase-architecture` or `engineering-workflows:plan` before
continuing implementation.

## Dependency Rules

- Prefer built-in or standard-library capabilities when they fit the problem.
- Prefer existing project dependencies before adding new ones.
- Prefer widely adopted, well-maintained third-party libraries over custom code when they reduce
  real complexity, especially for parsing, protocols, formats, crypto, date/time, validation, and
  framework-level behavior.
- Avoid adding dependencies for tiny helpers, unstable experiments, or code that the project can
  express clearly with existing tools.
- Follow existing project dependency, licensing, security, and package-manager conventions.

## Workflow

### 1. Choose The First Slice

Inspect the relevant code, docs, commands, and planned direction. Identify:

- the smallest useful behavior or workflow to make real
- the public command, API, file, or UI surface the slice should expose
- representative input or a real workflow that can prove it works
- the quickest validation command or manual check worth running
- the likely seams that should stay easy to change

When the slice or validation signal is ambiguous, state the assumption and proceed if low risk; ask
only when the wrong choice would waste work or lock in the wrong interface.

### 2. Make It Work

Implement the slice until there is a runnable result. Prefer straightforward code over speculative
abstractions, but keep behavior close to the seam that should eventually own it.

Do not write broad implementation-shaped tests while module boundaries are still moving.

### 3. Prove It Works

Run the smallest credible validation:

- CLI command with sample input
- script or smoke test
- browser or API flow
- generated artifact inspection
- focused unit or integration test
- project lint, typecheck, or format command when relevant

If validation cannot run, explain the missing setup, artifact, dependency, or user action needed.

### 4. Refactor The Shape

After the slice works, simplify:

- reduce caller knowledge
- move behavior behind a deeper interface
- remove pass-through abstractions
- improve names around domain language
- isolate external boundaries behind adapters when useful
- delete throwaway scaffolding unless it became durable tooling

### 5. Add Tests When They Now Help

Add tests only when they protect now-stable behavior or cheap regression coverage. Prefer tests at
the public interface and avoid tests that would churn during expected interface refactors.

Name any intentionally deferred tests and why adding them now would create churn.

### 6. Repeat

Add the next vertical slice only after the current slice works, the shape is clean enough to extend,
and the validation signal is credible.

## Completion

When the requested behavior is built:

- Run the full relevant validation for the touched area.
- Report the working slices completed.
- Name the validation evidence.
- Name tests added or intentionally deferred.
- Note remaining architecture or interface risks.

Stop when the requested behavior works and the smallest relevant validation passes, or when progress
is blocked by an unresolved interface decision, missing dependency, or failing project setup.
