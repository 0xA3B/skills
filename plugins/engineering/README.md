# Engineering

These skills cover the engineering loop from decision mapping and design review through
implementation, diagnosis, code review, and session handoff. The skills list below names each
workflow.

The typical implementation flow starts with `wayfinder`, which maps a loose or oversized idea into
decision-sized chunks. `grill-me` resolves a selected direction through adversarial questioning, and
`prototype` answers questions that need disposable executable evidence, and loads on its own for
prototype and spike requests. `tdd` implements observable behavior through a red-green-refactor loop
over a frontier of behaviors, and loads on its own for implementation requests. `review-changes`
reviews changes the session authored through focused lanes, fixes accepted findings, verifies the
fixes with the lanes that reviewed them, and reruns the lanes those fixes invalidated; `tdd` applies
it at completion. Use `handoff` when another agent session should continue the work from an ignored
local context document.

`codebase-design` is a shared background discipline consumed by the user-facing workflows.
`terminology`, `diagnose`, `improve-codebase-architecture`, `improve-codebase-tests`, and
`dependency-maintenance` remain focused workflows for their respective concerns.

On Claude Code, the bundled `code-review` skill competes with `review-changes` for generic review
prompts. To keep the bundled skill typable as `/code-review` but stop its implicit invocation, set
`"skillOverrides": { "code-review": "user-invocable-only" }` in settings. When no bundled skills
should load at all, set `disableBundledSkills: true` instead.

Some skills come from Matt Pocock's MIT-licensed
[`mattpocock/skills`](https://github.com/mattpocock/skills) repository. Adapted skills include Agent
Skills frontmatter with `license: MIT` plus metadata for the original author and source path. The
MIT license notice from the source repository is in [LICENSE](./LICENSE).

## Skills

- `engineering:codebase-design`: Apply shared deep-module and interface-design discipline.
- `engineering:dependency-maintenance`: Review dependency update PRs, merge ready ones, sync local
  state, refresh repo-pinned tooling, and file linked follow-up issues.
- `engineering:diagnose`: Diagnose bugs through a tight red-capable loop, minimization, falsifiable
  probes, and regression evidence.
- `engineering:grill-me`: Stress-test a plan, decision, idea, or design until the user confirms
  shared understanding.
- `engineering:handoff`: Save a compact local continuation document for another agent session.
- `engineering:improve-codebase-architecture`: Find focused, evidence-backed module deepening
  opportunities.
- `engineering:improve-codebase-tests`: Find evidence-backed test-suite improvement opportunities.
- `engineering:prototype`: Create disposable exploratory code to answer one design question.
- `engineering:receiving-feedback`: Triage and respond to existing review feedback.
- `engineering:review-changes`: Review changes authored in the current session through focused
  lanes, fix accepted findings, and rerun invalidated lanes.
- `engineering:tdd`: Build features or fixes with a red-green-refactor loop.
- `engineering:terminology`: Create, update, or review durable project terminology.
- `engineering:wayfinder`: Map a loose idea into decisions, dependencies, frontier, fog, and
  excluded scope.
