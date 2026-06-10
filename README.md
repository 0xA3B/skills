# Skills

These are my skills and workflows for AI agents. You can use them directly or just explore for
inspiration.

## Install

Add marketplace to Codex:

```bash
codex plugin marketplace add 0xA3B/skills
```

Upgrade the marketplace later:

```bash
codex plugin marketplace upgrade 0xa3b-marketplace
```

After adding or upgrading the marketplace, install the desired plugins from Codex.

## Codex Plugins

### `claudex`

Runs Claude Code from Codex for adversarial code review, feedback triage, and in-scope fixes.

> [!WARNING]
> This runs Claude non-interactively (`claude -p`) and may consume credits rather than Claude
> subscription usage.

- [`claudex:adversarial-review`](./codex_plugins/claudex/skills/adversarial-review/): Invokes Claude
  Code as a read-only adversarial reviewer, triages findings as external feedback, and applies
  accepted in-scope fixes for current working-tree changes.

### `conventional-commits`

Skills for drafting and creating Conventional Commits.

- [`conventional-commits:commit`](./codex_plugins/conventional-commits/skills/commit/): Reviews
  current changes, stages logical units, and creates git commits with Conventional Commit messages.
- [`conventional-commits:draft-message`](./codex_plugins/conventional-commits/skills/draft-message/):
  Drafts Conventional Commit messages without staging or committing.

### `engineering-workflows`

Engineering workflow skills for brainstorming, adversarial design review, dependency maintenance,
disposable prototyping, building, TDD, diagnosis, architecture review, durable terminology, codebase
orientation, scoped code review, review-feedback triage, and visual presentation artifacts. Some
skills are adapted from Matt Pocock's MIT-licensed
[`mattpocock/skills`](https://github.com/mattpocock/skills) repository with source attribution
preserved in each adapted skill's Agent Skills frontmatter metadata.

Typical implementation flow: `brainstorm` when solution direction is unclear, `grill-me` once a
direction is selected and needs interrogation, `prototype` when a question needs disposable
executable evidence, then `build` for greenfield or high-churn implementation and `tdd` for stable
behavior. Use `terminology` when stable domain language needs a focused create, update, or review
pass. Use `review-changes` for worktree review before commit and `review-branch` for pre-merge
branch review. `review-feedback` handles existing reviewer feedback. `diagnose`, `zoom-out`, and
`improve-codebase-architecture` are ad hoc workflows for specific needs. Use
`dependency-maintenance` when dependency update PRs need evidence-backed triage, safe merges, local
sync, and linked follow-up issues for migration or feature work. `visualize` is a manual
presentation workflow for turning session output into a temporary visual artifact without changing
the underlying analysis.

- [`engineering-workflows:brainstorm`](./codex_plugins/engineering-workflows/skills/brainstorm/):
  Researches and compares solution options before adversarial review.
- [`engineering-workflows:build`](./codex_plugins/engineering-workflows/skills/build/): Implements
  working slices with pragmatic validation.
- [`engineering-workflows:dependency-maintenance`](./codex_plugins/engineering-workflows/skills/dependency-maintenance/):
  Reviews dependency update PRs, merges ready ones, syncs local state, and files linked follow-up
  issues.
- [`engineering-workflows:diagnose`](./codex_plugins/engineering-workflows/skills/diagnose/): Runs a
  disciplined diagnosis loop for bugs, flaky behavior, and performance regressions.
- [`engineering-workflows:prototype`](./codex_plugins/engineering-workflows/skills/prototype/):
  Creates disposable exploratory code to answer a design question.
- [`engineering-workflows:review-branch`](./codex_plugins/engineering-workflows/skills/review-branch/):
  Reviews a branch, PR, or MR before merge.
- [`engineering-workflows:review-changes`](./codex_plugins/engineering-workflows/skills/review-changes/):
  Reviews and fixes current worktree changes before commit.
- [`engineering-workflows:review-feedback`](./codex_plugins/engineering-workflows/skills/review-feedback/):
  Triages and responds to existing review feedback.
- [`engineering-workflows:tdd`](./codex_plugins/engineering-workflows/skills/tdd/): Builds features
  or fixes with a red-green-refactor loop.
- [`engineering-workflows:grill-me`](./codex_plugins/engineering-workflows/skills/grill-me/):
  Stress-tests an approach through adversarial questioning.
- [`engineering-workflows:terminology`](./codex_plugins/engineering-workflows/skills/terminology/):
  Creates, updates, or reviews durable project terminology.
- [`engineering-workflows:zoom-out`](./codex_plugins/engineering-workflows/skills/zoom-out/): Maps
  an unfamiliar code area at a higher level of abstraction.
- [`engineering-workflows:improve-codebase-architecture`](./codex_plugins/engineering-workflows/skills/improve-codebase-architecture/):
  Finds module deepening and architecture improvement opportunities.
- [`engineering-workflows:visualize`](./codex_plugins/engineering-workflows/skills/visualize/):
  Creates a temporary visual report, diagram, or presentation artifact from the current session.
