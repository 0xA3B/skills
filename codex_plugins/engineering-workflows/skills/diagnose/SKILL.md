---
name: diagnose
description: >-
  Run a disciplined diagnosis loop for bugs, failures, flaky behavior, and performance regressions:
  reproduce, minimize, hypothesize, instrument, fix, and regression-test. Use when the user
  explicitly asks to diagnose or debug a problem.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/diagnose
---

# Diagnose

Use a disciplined loop for hard bugs. Skip phases only when explicitly justified by evidence.

When exploring the codebase, use the project's domain language from `AGENTS.md`, README files,
nearby docs, and code names. Use project-specific test, lint, run, and reproduction workflows over
generic commands.

## Success Criteria

- The reported symptom is reproduced with a credible feedback loop, or the missing artifact or
  access is identified.
- The root cause is supported by evidence from the loop, instrumentation, or code inspection.
- The fix addresses that cause and preserves nearby behavior.
- A durable regression check covers the bug when a correct test seam exists.
- Temporary instrumentation and throwaway harnesses are removed or clearly left as durable tooling.

## Phase 1: Build A Feedback Loop

This is the skill. Everything else depends on having a fast, deterministic, agent-runnable pass/fail
signal for the reported problem. If there is no loop, bisection, hypothesis testing, and
instrumentation have nothing reliable to consume.

Spend disproportionate effort here. Be aggressive and creative about finding a loop that captures
the user's exact symptom.

Try these in roughly this order:

1. A failing test at the smallest useful level: unit, integration, or end-to-end.
2. A `curl`, HTTP, or CLI script against a running service.
3. A command invocation with fixture input and expected output.
4. A headless browser script that asserts on DOM, console, or network behavior.
5. A replayed trace, payload, event log, or captured request.
6. A throwaway harness that exercises the suspect function or subsystem.
7. A property or fuzz loop for wrong-output or intermittent behavior.
8. A bisection harness suitable for `git bisect run`.
9. A differential loop comparing old/new versions or alternate configurations.
10. A human-in-the-loop script using `scripts/hitl-loop.template.sh` when manual interaction is
    truly unavoidable.

Improve the loop as soon as it exists:

- Make it faster by narrowing setup and skipping unrelated initialization.
- Make the signal sharper by asserting on the specific symptom.
- Make it more deterministic by pinning time, seeding randomness, and isolating filesystem or
  network dependencies.

For nondeterministic bugs, the initial goal is a higher reproduction rate. Run the trigger many
times, parallelize, stress timing windows, and add targeted sleeps or logging until the failure is
debuggable.

If you genuinely cannot build a loop, stop and say so. List what you tried, then ask the user for
the missing artifact or access: logs, HAR file, core dump, screen recording with timestamps, access
to the reproducing environment, or permission to add temporary instrumentation.

Do not proceed to Phase 2 until the loop is credible.

## Phase 2: Reproduce

Run the loop and watch the bug appear.

Confirm:

- The loop produces the failure mode the user described, not a nearby failure.
- The failure is reproducible across multiple runs, or frequent enough to debug when
  nondeterministic.
- The exact symptom is captured: error, wrong output, bad state, timing, UI behavior, or logs.

Wrong bug means wrong fix. Do not proceed until the observed failure matches the user's report.

## Phase 3: Hypothesize

Generate 3-5 ranked hypotheses before testing any one of them. Single-hypothesis debugging anchors
too early.

Each hypothesis must be falsifiable:

```text
If <cause> is true, then <probe or change> should make <observable result> happen.
```

Discard or sharpen any hypothesis that does not make a prediction.

Share the ranked list when it would help the user apply domain knowledge, but do not block progress
when the next probe is low risk and the user is not available.

## Phase 4: Instrument

Each probe must map to a prediction from Phase 3.

- Change one variable at a time.
- Prefer direct observations over inferred explanations.
- Add temporary logging, assertions, counters, snapshots, or timing probes where they answer a
  specific question.
- Keep instrumentation easy to remove.
- Record what each probe proves or rules out.

Tag temporary debug output with a distinctive prefix when practical so cleanup can be verified with
a focused search.

If a probe contradicts the current theory, update the ranked hypotheses instead of forcing the
evidence to fit.

## Phase 5: Fix

Make the smallest change that explains the reproduced failure and the instrumentation results.

When a correct test seam exists, turn the minimized reproduction into a failing regression check
before applying the fix. A correct seam exercises the same bug pattern as the real failure; a
shallow test that cannot reproduce the causal path gives false confidence.

The fix should:

- Address the cause, not only mask the symptom.
- Preserve existing behavior outside the failing path.
- Remove temporary instrumentation unless it belongs as durable observability.
- Keep the feedback loop in place long enough to prove the fix.

If no correct regression seam exists, note that as an architecture or testability finding and still
prove the fix with the best available loop.

## Phase 6: Regression-Test

Convert the feedback loop into a durable regression check when practical. Use the smallest stable
test that would have caught the bug.

Run the relevant validation:

- The new or updated regression check.
- Nearby tests for the touched behavior.
- The project's smallest relevant lint, typecheck, or formatting command.

If a durable regression test is not practical, explain why and name the manual or operational check
that now covers the risk.

## Final Report

End with:

- Root cause.
- Reproduction signal used.
- Fix summary.
- Regression coverage.
- Validation commands and results.
