# Skills

This repository holds my reusable skills and workflows for AI agents, packaged as Claude Code and
Codex plugins. Use them directly, or explore them for inspiration.

## Install

You can install plugins from this repository in both Codex and Claude Code. Every plugin is
available to both agents unless its section below says otherwise.

### Codex

Add the marketplace to Codex:

```bash
codex plugin marketplace add 0xA3B/skills
```

Upgrade the marketplace later:

```bash
codex plugin marketplace upgrade 0xa3b-marketplace
```

After you add or upgrade the marketplace, install the plugins that you want from Codex.

### Claude Code

Add the marketplace inside Claude Code:

```text
/plugin marketplace add 0xA3B/skills
```

Then install the plugins that you want:

```text
/plugin install codex-in-claude@0xa3b-marketplace
/plugin install git-workflows@0xa3b-marketplace
/plugin install engineering-workflows@0xa3b-marketplace
/plugin install writing@0xa3b-marketplace
/plugin install meta@0xa3b-marketplace
```

Update the marketplace later with `/plugin marketplace update 0xa3b-marketplace`.

## Plugins

### `claude-in-codex`

> Codex-only: this plugin exists to drive Claude Code from Codex, so this repository does not
> publish it to the Claude Code marketplace.

This plugin runs Claude Code from Codex for adversarial code review, feedback triage, and in-scope
fixes.

- [`claude-in-codex:adversarial-review`](./plugins/claude-in-codex/skills/adversarial-review/):
  Invokes Claude Code as a review-scoped adversarial reviewer, triages findings as external
  feedback, and applies accepted in-scope fixes for current working-tree changes.
- [`claude-in-codex:using-claude-cli`](./plugins/claude-in-codex/skills/using-claude-cli/): Internal
  contract for running the Claude Code CLI non-interactively, with prompting guidance and a copyable
  `.codex/agents/claude.toml` proxy subagent definition.

### `codex-in-claude`

> Claude Code-only: this plugin exists to drive Codex from Claude Code, so this repository does not
> publish it to the Codex marketplace.

This plugin runs Codex from Claude Code for adversarial code review, feedback triage, and in-scope
fixes. It also ships a `codex` subagent that delegates tasks to Codex.

- [`codex-in-claude:adversarial-review`](./plugins/codex-in-claude/skills/adversarial-review/):
  Invokes Codex as an adversarial reviewer at the user's configured sandbox and permission defaults,
  triages findings as external feedback, and applies accepted in-scope fixes for current
  working-tree changes.
- [`codex-in-claude:using-codex-cli`](./plugins/codex-in-claude/skills/using-codex-cli/): Internal
  contract for running the Codex CLI non-interactively, with GPT-5.5 prompting guidance.

### `git-workflows`

These skills create Conventional Commits and drive GitHub or GitLab change requests from operational
preparation through automated review and verified merge cleanup.

`address-pr-feedback` requires the `engineering-workflows` plugin so it can apply the shared
`receiving-feedback` discipline.

- [`git-workflows:commit`](./plugins/git-workflows/skills/commit/): Reviews current changes, stages
  logical units, and creates git commits with Conventional Commit messages.
- [`git-workflows:create-pr`](./plugins/git-workflows/skills/create-pr/): Prepares a branch, creates
  or refreshes its pull request or merge request, and observes initial CI.
- [`git-workflows:address-pr-feedback`](./plugins/git-workflows/skills/address-pr-feedback/): Drives
  active automated-review adapters to approval or a reported exception.
- [`git-workflows:merge-pr`](./plugins/git-workflows/skills/merge-pr/): Verifies merge gates, merges
  synchronously, and cleans up verified local and remote branch state.

### `engineering-workflows`

These skills cover the engineering loop from decision mapping and design review through
implementation, diagnosis, code review, and session handoff. Some skills come from Matt Pocock's
MIT-licensed [`mattpocock/skills`](https://github.com/mattpocock/skills) repository; each adapted
skill records its original author and source in its Agent Skills frontmatter metadata.

The typical implementation flow starts with `wayfinder`, which maps a loose idea into decision-sized
chunks. `grill-me` resolves a selected direction, and `prototype` answers questions that need
executable evidence. Use `build` for greenfield or high-churn implementation and `tdd` for stable
behavior. Use `review-changes` for changes the current session authored and `review-branch` for a
branch the session did not author. `codebase-design` and `reviewing-code` provide shared background
discipline. Use `handoff` when another agent session should continue from an ignored local context
document.

- [`engineering-workflows:build`](./plugins/engineering-workflows/skills/build/): Implements working
  slices with pragmatic validation.
- [`engineering-workflows:codebase-design`](./plugins/engineering-workflows/skills/codebase-design/):
  Applies shared deep-module and interface-design discipline.
- [`engineering-workflows:dependency-maintenance`](./plugins/engineering-workflows/skills/dependency-maintenance/):
  Reviews dependency update PRs, merges ready ones, syncs local state, refreshes repo-pinned
  tooling, and files linked follow-up issues.
- [`engineering-workflows:diagnose`](./plugins/engineering-workflows/skills/diagnose/): Runs a
  disciplined diagnosis loop for bugs, flaky behavior, and performance regressions.
- [`engineering-workflows:grill-me`](./plugins/engineering-workflows/skills/grill-me/): Stress-tests
  a plan, decision, idea, or design through adversarial questioning.
- [`engineering-workflows:handoff`](./plugins/engineering-workflows/skills/handoff/): Saves a
  compact local continuation document for another agent session.
- [`engineering-workflows:improve-codebase-architecture`](./plugins/engineering-workflows/skills/improve-codebase-architecture/):
  Finds focused, evidence-backed module deepening opportunities.
- [`engineering-workflows:improve-codebase-tests`](./plugins/engineering-workflows/skills/improve-codebase-tests/):
  Finds evidence-backed test-suite improvement opportunities.
- [`engineering-workflows:prototype`](./plugins/engineering-workflows/skills/prototype/): Creates
  disposable exploratory code to answer a design question.
- [`engineering-workflows:review-branch`](./plugins/engineering-workflows/skills/review-branch/):
  Reviews a branch, PR, or MR the session did not author before merge.
- [`engineering-workflows:review-changes`](./plugins/engineering-workflows/skills/review-changes/):
  Reviews and fixes changes authored in the current session.
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

### `meta`

This plugin maintains the marketplace itself; its skills operate on the marketplace's own skills and
repository rather than on a user's project.

- [`meta:submit-skill-feedback`](./plugins/meta/skills/submit-skill-feedback/): Captures the
  session's feedback on how a marketplace skill performed during an actual run and files each item
  as a GitHub issue in this repository, labeled `feedback` plus `plugin:<plugin-name>`.

### `writing`

These skills govern the documents agents and humans read; the plugin also ships chat output styles
for Claude Code sessions. The document-mechanics guidance comes from Matt Pocock's MIT-licensed
[`mattpocock/skills`](https://github.com/mattpocock/skills) repository, with the attribution
recorded in the skill's Agent Skills frontmatter metadata.

- [`writing:agent-instructions`](./plugins/writing/skills/agent-instructions/): House style and
  document mechanics for files that instruct agents — `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, agent
  definitions, and system-prompt fragments.
- [`writing:documentation`](./plugins/writing/skills/documentation/): Simplified Technical English
  wording and Google developer style formatting for human-facing documentation — READMEs, guides,
  runbooks, reference prose, and release notes.

Output styles ship in [`plugins/writing/output-styles/`](./plugins/writing/output-styles/) and
materialize in Claude Code only: `google-developer-style` and `simplified-technical-english` apply
their respective style guides to chat responses.

## License

This repository is under the MIT license. See [LICENSE](./LICENSE), and see each plugin's license
file for adapted content.
