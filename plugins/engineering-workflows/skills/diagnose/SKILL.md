---
name: diagnose
description: >-
  Run a disciplined diagnosis loop for bugs, failures, flaky behavior, and performance regressions:
  build a red-capable loop, reproduce and minimize, rank falsifiable hypotheses, instrument, fix,
  and regression-test. Use when the user explicitly asks to diagnose or debug a problem.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/e9fcdf95b402d360f90f1db8d776d5dd450f9234/skills/engineering/diagnosing-bugs
disable-model-invocation: true
argument-hint: "[problem]"
---

# Diagnose

Use a tight evidence loop for hard bugs. Each phase produces the evidence required by the next; skip
a phase only when current evidence explicitly satisfies its completion criterion.

Use project-specific run, test, lint, and reproduction workflows. Align names with
`AGENTS.md ## Terminology` when present.

## Success Criteria

- One agent-runnable command captures the user's exact symptom and changes verdict when the bug is
  fixed.
- The reproduction is minimized enough to narrow the causal mechanism.
- The root cause is supported by falsifiable probes, not inferred from a plausible code reading.
- The fix addresses that cause and preserves nearby behavior.
- A durable regression check covers the bug when a correct test seam exists.
- Temporary instrumentation and throwaway harnesses are removed or intentionally retained as durable
  tooling.

## 1. Build A Tight Red-Capable Loop

This is the primary work. Find the smallest credible signal that can catch this exact bug:

1. failing unit, integration, or end-to-end test;
2. HTTP, CLI, or command invocation with fixture input and asserted output;
3. headless browser assertion over DOM, console, or network behavior;
4. captured request, trace, payload, event, or data replay;
5. throwaway harness around the suspect subsystem;
6. property, fuzz, stress, bisection, or differential loop;
7. `scripts/hitl-loop.template.sh` only when human interaction is unavoidable.

Tighten the loop by reducing runtime, isolating setup, pinning time, seeding randomness, freezing
network or filesystem dependencies, and asserting the specific symptom.

For nondeterministic bugs, raise and measure the reproduction rate through repetition, concurrency,
or timing stress until the signal is useful.

Phase 1 is complete only when one command has already been run and is:

- **red-capable**: exercises the real bug path and catches the user's exact symptom;
- **deterministic**: gives the same verdict, or a pinned high reproduction rate for a flaky bug;
- **fast**: normally seconds rather than minutes;
- **agent-runnable**: unattended except through the structured HITL script.

If no credible loop can be built, stop. Report what was tried and request the missing artifact,
environment, access, or permission for targeted instrumentation. Do not hypothesize without a
red-capable loop.

## 2. Reproduce And Minimize

Run the loop and confirm it fails in the way the user described, not at a nearby setup error. Repeat
enough times to establish the signal.

Then remove inputs, callers, configuration, data, and steps one at a time, rerunning after every
change. Stop minimizing when every remaining element is load-bearing: removing any one makes the
loop green or changes the failure mechanism.

## 3. Rank Falsifiable Hypotheses

Generate three to five ranked hypotheses before probing any one. Write each as:

```text
If <cause> is true, then <one probe> will produce <observable result>.
```

Discard explanations that make no prediction. Show the ranked list to the user when their domain
knowledge could change the order, but continue with the leading safe probe if they are unavailable.

Do not include untethered fixes in the list. A change is a probe only when its predicted observation
would confirm or falsify a cause.

## 4. Instrument One Variable At A Time

Map every probe to one hypothesis and change one variable at a time.

Prefer:

1. debugger or REPL inspection;
2. targeted assertions, counters, snapshots, or timing probes;
3. narrow logs at boundaries that distinguish hypotheses.

Avoid broad logging followed by grep. Tag temporary output with a unique prefix such as
`[DEBUG-a4f2]` so cleanup is checkable.

For performance regressions, establish a baseline measurement, profiler result, query plan, or
timing distribution before modifying behavior. Measure first, then bisect or probe.

Update the rankings when evidence contradicts the current theory. Do not force observations to fit
the first plausible explanation.

## 5. Lock The Bug Down And Fix The Cause

When a correct test seam exists, convert the minimized reproduction into a failing regression test
before applying the fix. The seam must exercise the actual bug pattern; a shallow test that cannot
reproduce the causal path gives false confidence.

Make the smallest change that explains both the original failure and the probe results. Rerun:

- the regression test;
- the minimized loop;
- the original, unminimized reproduction.

If the fix fails, revert or revise that attempt before testing another hypothesis. Do not stack
speculative patches. After three plausible failed fixes, stop and reassess the reproduction, system
boundary, ownership model, and test seam before attempting a fourth. Summarize what each failed
attempt proved, then ask the user about the blocking decision or recommend an explicit
`engineering-workflows:improve-codebase-architecture` handoff when the code shape is the blocker.

When no correct regression seam exists, record that as an architecture and testability finding and
prove the fix with the best available loop.

## 6. Clean Up And Learn

Before declaring completion:

- rerun the original reproduction and show it is green;
- run the regression test and nearby relevant validation;
- search for and remove the unique debug prefix;
- remove throwaway harnesses and prototypes unless deliberately retained as durable tooling;
- state the supported root cause and which evidence ruled out the alternatives;
- identify what would have prevented the bug.

If prevention requires architectural work, recommend an explicit
`engineering-workflows:improve-codebase-architecture` handoff with the missing seam or coupling
evidence. Make that recommendation after the fix, when the system is best understood.

## Final Report

End with the root cause, loop command and before/after signal, minimized reproduction, fix,
regression coverage, validation results, cleanup status, and remaining architecture follow-up.
