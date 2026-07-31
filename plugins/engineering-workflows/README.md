# Engineering Workflows

Engineering workflow skills for breadth-first decision mapping, adversarial design review,
dependency maintenance, durable terminology, shared codebase design, disposable prototyping,
building, TDD, diagnosis, scoped code review, session handoffs, feedback triage, and visual
presentation artifacts.

Typical implementation flow: `wayfinder` maps a loose or oversized idea into decision-sized chunks,
`grill-me` resolves a selected direction through adversarial questioning, and `prototype` answers
questions that need disposable executable evidence. Use `build` for greenfield or high-churn
implementation and `tdd` for stable behavior. `review-changes` reviews the worktree before commit
and `review-branch` reviews a branch before merge. Use `handoff` when another agent session should
continue the work from an ignored local context document.

`codebase-design` and `reviewing-code` are shared background disciplines consumed by the user-facing
workflows. `terminology`, `diagnose`, `improve-codebase-architecture`, `dependency-maintenance`, and
`visualize` remain focused workflows for their respective concerns.

On Claude Code, the bundled `code-review` skill competes for generic review prompts. Treat the
manual `review-changes` and `review-branch` invocations as the primary entry points. To keep the
bundled skill typable as `/code-review` while stopping it from triggering implicitly, set
`"skillOverrides": { "code-review": "user-invocable-only" }` in settings; set
`disableBundledSkills: true` instead when no bundled skills should load at all.

Some skills are adapted from Matt Pocock's MIT-licensed
[`mattpocock/skills`](https://github.com/mattpocock/skills) repository. Adapted skills include Agent
Skills frontmatter with `license: MIT` plus metadata for the original author and source path. The
MIT license notice from the source repository is preserved in [LICENSE](./LICENSE).

## Skills

- `engineering-workflows:build`: Implement working slices with pragmatic validation.
- `engineering-workflows:codebase-design`: Apply shared deep-module and interface-design discipline.
- `engineering-workflows:dependency-maintenance`: Review dependency update PRs, merge ready ones,
  sync local state, refresh repo-pinned tooling, and file linked follow-up issues.
- `engineering-workflows:diagnose`: Diagnose bugs through a tight red-capable loop, minimization,
  falsifiable probes, and regression evidence.
- `engineering-workflows:grill-me`: Stress-test a plan, decision, idea, or design until the user
  confirms shared understanding.
- `engineering-workflows:handoff`: Save a compact local continuation document for another agent
  session.
- `engineering-workflows:improve-codebase-architecture`: Find focused, evidence-backed module
  deepening opportunities.
- `engineering-workflows:prototype`: Create disposable exploratory code to answer one design
  question.
- `engineering-workflows:receiving-feedback`: Triage and respond to existing review feedback.
- `engineering-workflows:review-branch`: Review a branch, PR, or MR before merge.
- `engineering-workflows:review-changes`: Review and fix current worktree changes before commit.
- `engineering-workflows:reviewing-code`: Apply shared review-lane selection, isolation, and finding
  contracts.
- `engineering-workflows:tdd`: Build features or fixes with a red-green-refactor loop.
- `engineering-workflows:terminology`: Create, update, or review durable project terminology.
- `engineering-workflows:visualize`: Create a temporary visual report, diagram, or presentation
  artifact from the current session.
- `engineering-workflows:wayfinder`: Map a loose idea into decisions, dependencies, frontier, fog,
  and excluded scope.
