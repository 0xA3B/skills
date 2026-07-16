# Skills

These are my skills and workflows for AI agents. You can use them directly or just explore for
inspiration.

## Install

Plugins install from this repository in both Codex and Claude Code. Every plugin is available to
both agents unless its section below says otherwise.

### Codex

Add the marketplace to Codex:

```bash
codex plugin marketplace add 0xA3B/skills
```

Upgrade the marketplace later:

```bash
codex plugin marketplace upgrade 0xa3b-marketplace
```

After adding or upgrading the marketplace, install the desired plugins from Codex.

### Claude Code

Add the marketplace inside Claude Code:

```text
/plugin marketplace add 0xA3B/skills
```

Then install the desired plugins:

```text
/plugin install codex-in-claude@0xa3b-marketplace
/plugin install conventional-commits@0xa3b-marketplace
/plugin install engineering-workflows@0xa3b-marketplace
```

Update the marketplace later with `/plugin marketplace update 0xa3b-marketplace`.

## Plugins

### `claude-in-codex`

> Codex-only: this plugin exists to drive Claude Code from Codex, so it is not published to the
> Claude Code marketplace.

Runs Claude Code from Codex for adversarial code review, feedback triage, and in-scope fixes.

- [`claude-in-codex:adversarial-review`](./plugins/claude-in-codex/skills/adversarial-review/):
  Invokes Claude Code as a review-scoped adversarial reviewer, triages findings as external
  feedback, and applies accepted in-scope fixes for current working-tree changes.
- [`claude-in-codex:using-claude-cli`](./plugins/claude-in-codex/skills/using-claude-cli/): Internal
  contract for running the Claude Code CLI non-interactively, with prompting guidance and a copyable
  `.codex/agents/claude.toml` proxy subagent definition.

### `codex-in-claude`

> Claude Code-only: this plugin exists to drive Codex from Claude Code, so it is not published to
> the Codex marketplace.

Runs Codex from Claude Code for adversarial code review, feedback triage, and in-scope fixes, and
ships a `codex` subagent for delegating tasks to Codex.

- [`codex-in-claude:adversarial-review`](./plugins/codex-in-claude/skills/adversarial-review/):
  Invokes Codex as a sandboxed read-only adversarial reviewer, triages findings as external
  feedback, and applies accepted in-scope fixes for current working-tree changes.
- [`codex-in-claude:using-codex-cli`](./plugins/codex-in-claude/skills/using-codex-cli/): Internal
  contract for running the Codex CLI non-interactively, with GPT-5.5 prompting guidance.

### `conventional-commits`

Skills for drafting and creating Conventional Commits.

- [`conventional-commits:commit`](./plugins/conventional-commits/skills/commit/): Reviews current
  changes, stages logical units, and creates git commits with Conventional Commit messages.
- [`conventional-commits:draft-message`](./plugins/conventional-commits/skills/draft-message/):
  Drafts Conventional Commit messages without staging or committing.

### `engineering-workflows`

Engineering workflow skills for decision mapping, adversarial design review, dependency maintenance,
disposable prototyping, building, TDD, diagnosis, architecture review, durable terminology, scoped
code review, session handoffs, feedback triage, and visual presentation artifacts. Some skills are
adapted from Matt Pocock's MIT-licensed [`mattpocock/skills`](https://github.com/mattpocock/skills)
repository with source attribution preserved in each adapted skill's Agent Skills frontmatter
metadata.

Typical implementation flow: `wayfinder` maps a loose idea into decision-sized chunks, `grill-me`
resolves a selected direction, and `prototype` answers questions that need executable evidence. Use
`build` for greenfield or high-churn implementation and `tdd` for stable behavior. Use
`review-changes` before commit and `review-branch` before merge. `codebase-design` and
`reviewing-code` provide shared background discipline. Use `handoff` when another agent session
should continue from an ignored local context document.

- [`engineering-workflows:build`](./plugins/engineering-workflows/skills/build/): Implements working
  slices with pragmatic validation.
- [`engineering-workflows:codebase-design`](./plugins/engineering-workflows/skills/codebase-design/):
  Applies shared deep-module and interface-design discipline.
- [`engineering-workflows:dependency-maintenance`](./plugins/engineering-workflows/skills/dependency-maintenance/):
  Reviews dependency update PRs, merges ready ones, syncs local state, and files linked follow-up
  issues.
- [`engineering-workflows:diagnose`](./plugins/engineering-workflows/skills/diagnose/): Runs a
  disciplined diagnosis loop for bugs, flaky behavior, and performance regressions.
- [`engineering-workflows:grill-me`](./plugins/engineering-workflows/skills/grill-me/): Stress-tests
  a plan, decision, idea, or design through adversarial questioning.
- [`engineering-workflows:handoff`](./plugins/engineering-workflows/skills/handoff/): Saves a
  compact local continuation document for another agent session.
- [`engineering-workflows:improve-codebase-architecture`](./plugins/engineering-workflows/skills/improve-codebase-architecture/):
  Finds focused, evidence-backed module deepening opportunities.
- [`engineering-workflows:prototype`](./plugins/engineering-workflows/skills/prototype/): Creates
  disposable exploratory code to answer a design question.
- [`engineering-workflows:review-branch`](./plugins/engineering-workflows/skills/review-branch/):
  Reviews a branch, PR, or MR before merge.
- [`engineering-workflows:review-changes`](./plugins/engineering-workflows/skills/review-changes/):
  Reviews and fixes current worktree changes before commit.
- [`engineering-workflows:reviewing-code`](./plugins/engineering-workflows/skills/reviewing-code/):
  Applies shared review-lane selection, isolation, and finding contracts.
- [`engineering-workflows:receiving-feedback`](./plugins/engineering-workflows/skills/receiving-feedback/):
  Triages and responds to existing review feedback.
- [`engineering-workflows:tdd`](./plugins/engineering-workflows/skills/tdd/): Builds features or
  fixes with a red-green-refactor loop.
- [`engineering-workflows:terminology`](./plugins/engineering-workflows/skills/terminology/):
  Creates, updates, or reviews durable project terminology.
- [`engineering-workflows:visualize`](./plugins/engineering-workflows/skills/visualize/): Creates a
  temporary visual report, diagram, or presentation artifact from the current session.
- [`engineering-workflows:wayfinder`](./plugins/engineering-workflows/skills/wayfinder/): Maps a
  loose idea into decisions, dependencies, frontier, fog, and excluded scope.
