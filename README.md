# Skills

Personal skills and workflows for AI agents.

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

### `conventional-commits`

Skills for drafting and creating Conventional Commits.

- [`conventional-commits:commit`](./codex_plugins/conventional-commits/skills/commit/): Reviews
  current changes, stages logical units, and creates git commits with Conventional Commit messages.
- [`conventional-commits:draft-message`](./codex_plugins/conventional-commits/skills/draft-message/):
  Drafts Conventional Commit messages without staging or committing.

### `engineering-workflows`

Engineering workflow skills for brainstorming, planning, building, TDD, diagnosis, architecture
review, codebase orientation, and visual presentation artifacts. Some skills are adapted from Matt
Pocock's MIT-licensed [`mattpocock/skills`](https://github.com/mattpocock/skills) repository with
source attribution preserved in each adapted skill's Agent Skills frontmatter metadata.

Typical implementation flow: `brainstorm` when solution direction is unclear, `plan` once a
direction is selected, then `build` for greenfield or high-churn implementation and `tdd` for stable
behavior. `diagnose`, `zoom-out`, and `improve-codebase-architecture` are ad hoc workflows for
specific needs. `visualize` is a manual presentation workflow for turning session output into a
temporary visual artifact without changing the underlying analysis.

- [`engineering-workflows:brainstorm`](./codex_plugins/engineering-workflows/skills/brainstorm/):
  Researches and compares solution options before planning.
- [`engineering-workflows:build`](./codex_plugins/engineering-workflows/skills/build/): Implements
  working slices with pragmatic validation.
- [`engineering-workflows:diagnose`](./codex_plugins/engineering-workflows/skills/diagnose/): Runs a
  disciplined diagnosis loop for bugs, flaky behavior, and performance regressions.
- [`engineering-workflows:tdd`](./codex_plugins/engineering-workflows/skills/tdd/): Builds features
  or fixes with a red-green-refactor loop.
- [`engineering-workflows:plan`](./codex_plugins/engineering-workflows/skills/plan/): Turns a
  direction into an implementation-ready plan.
- [`engineering-workflows:zoom-out`](./codex_plugins/engineering-workflows/skills/zoom-out/): Maps
  an unfamiliar code area at a higher level of abstraction.
- [`engineering-workflows:improve-codebase-architecture`](./codex_plugins/engineering-workflows/skills/improve-codebase-architecture/):
  Finds module deepening and architecture improvement opportunities.
- [`engineering-workflows:visualize`](./codex_plugins/engineering-workflows/skills/visualize/):
  Creates a temporary visual report, diagram, or presentation artifact from the current session.
