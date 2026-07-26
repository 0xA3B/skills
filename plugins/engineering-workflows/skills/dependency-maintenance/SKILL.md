---
name: dependency-maintenance
description: >-
  Review dependency update PRs across package managers and forges, decide whether they are safe to
  merge, merge only ready updates, sync local dependency state, refresh repo-pinned tooling through
  small maintenance PRs, and create linked follow-up issues for breaking changes, validation
  failures, or useful new features. Use when the user asks to review Dependabot, Renovate, lockfile
  maintenance, security, runtime, package-manager, or other dependency update PRs, or to establish a
  dependency policy for a repository that has none.
license: MIT
disable-model-invocation: true
---

# Dependency Maintenance

Review dependency update PRs, merge only updates that are ready as-is, refresh repo-pinned
dependency tooling, and leave durable follow-up state for anything that needs code, migration, or
product judgment.

## Outcome

The repository's dependency update queue is triaged with clear evidence:

- Safe, green dependency PRs are merged through the repo's normal forge workflow.
- Local state is fast-forwarded and refreshed when the worktree is clean and the user asked for a
  full maintenance pass.
- Repo-pinned runtime, package-manager, and updater tool pins that dependency bots do not cover are
  refreshed through a small maintenance PR when validation and forge checks pass.
- PRs that are not ready have durable state: labels, comments, or linked issues that explain the
  blocker and next action.
- Breaking changes, required migrations, failed validation, and concrete feature opportunities are
  captured as follow-up issues instead of being implemented in this workflow.
- Decisions follow the repository's own dependency policy, and a repository that lacks one is left
  with a written policy when the user wants it.

## Repository Policy Precedence

Everything in this skill is a default. When the repository states its own dependency policy — in
agent guidance, a dependency policy document, contributing docs, or updater configuration — that
policy wins on any point it covers: bound posture, lockfile ownership, lock and transitive refresh,
update cadence, cooldowns, merge signals, and which pins are repo-owned.

Read that policy during discovery, before classifying anything. Apply these defaults only where the
repository is silent, and say which of the two you followed when they differ.

## Boundaries

- Do not write application, library, configuration, or tooling code to adapt to dependency changes.
- Do not create implementation branches or PRs for migration or adaptation work unless the user
  explicitly expands the scope.
- Do not merge a dependency PR with unresolved breaking changes, unexplained validation failures, or
  unclear diff scope.
- Do not invent repository labels by default. Discover existing labels first and use the closest
  existing state labels when helpful.
- Do not update user-global tools or machine-wide package managers. Keep tooling updates scoped to
  tracked, repo-pinned project state unless the user explicitly asks for a separate global-tool
  task.
- Do not change runtime majors, package-manager policy, or CI setup behavior as a drive-by tooling
  refresh when the release notes or diff indicate migration work is needed.
- Do not write a dependency policy the user did not ask for, and do not change an existing policy as
  a drive-by edit. Report the gap or the conflict instead.

Allowed side effects are limited to dependency PR review, safe dependency PR merges, local
fast-forward and install/runtime refreshes, PR labels/comments, follow-up issue creation,
repo-pinned tooling update PRs for full maintenance passes, and an initial dependency policy
document when the user asks for one.

## Workflow

Steps 2 through 8 are the maintenance pass. When the user asked only for a written dependency
policy, run step 1 to understand the repository, then go straight to step 9: triaging PRs, merging,
syncing local state, and refreshing tooling are unrelated state-changing actions the user did not
request. Offer the maintenance pass separately instead.

### 1. Discover

Identify the repository, current branch, default branch, forge, dependency update bot conventions,
open dependency PRs, and local validation commands.

Look for evidence in:

- The repository's dependency policy, wherever it lives: agent guidance, a linked policy document,
  contributing docs, or updater configuration. Read it before classifying anything; it outranks the
  defaults in this skill.
- Forge metadata: PR title, author, labels, checks, merge state, review state, linked issues, and
  bot comments.
- Repository metadata: `AGENTS.md`, README, CI workflows, package manager files, lockfiles,
  tool-version files, and dependency bot configuration.
- Existing labels that express state such as dependency, blocked, migration, security,
  breaking-change, needs-investigation, or do-not-merge.

Note whether a written dependency policy exists, separately from whether the repository has updater
configuration. Configured rules bind this workflow's decisions, but a repository can be fully
configured and still have nothing written down explaining the decisions behind it. If no written
policy exists, continue with these defaults and raise the gap in the final report.

Use the repository's own CLIs and auth wrappers when present. For GitHub, GitLab, or other forges,
choose the appropriate tool from local context instead of assuming a specific bot or CLI.

### 2. Understand Each PR

For each dependency PR, inspect enough evidence to classify it:

- Updated packages, versions, ecosystems, and whether updates are direct, transitive, grouped,
  runtime, package-manager, action, plugin, or lockfile-only changes.
- Diff scope, including manifest changes, lockfile churn, generated files, CI config, and package
  manager policy.
- Check status, mergeability, review requirements, security severity if relevant, and whether the PR
  is already superseded.
- Repository impact: imported APIs, configured plugins/actions, runtime compatibility, test
  coverage, and code paths likely affected by the update.

### 3. Research Release Notes

For direct major and minor bumps, read upstream release notes, changelogs, migration guides, or
package manager advisories. For patch bumps, research when the package is security-sensitive, the
diff is unusual, checks fail, or the update touches runtime/tooling behavior.

Look specifically for:

- Breaking changes, removals, deprecations, migration steps, changed defaults, compatibility
  constraints, and security advisories.
- New features that are plausibly useful to this repository, not merely generally interesting.
- Toolchain ownership changes such as new minimum runtime versions, lockfile format changes,
  package-manager policy changes, or CI setup changes.

If release-note evidence is unavailable, say so and classify from diff, tests, and repository usage
with that uncertainty visible.

### 4. Classify

Classify every PR before acting:

- `merge as-is`: checks are green, merge state is clean, diff scope is understood, and release-note
  review found no required migration.
- `blocked`: checks, permissions, branch state, policy, or missing access prevent a safe decision.
- `needs migration`: a breaking change or changed default likely requires code or configuration
  work.
- `needs investigation`: evidence is insufficient or validation failure cause is unclear.
- `feature follow-up`: a new feature looks specifically useful but is not required for the update.
- `unsafe`: the PR should not merge in its current form.

Merge only `merge as-is` PRs. Treat grouped updates as ready only when every meaningful bump in the
group is ready.

### 5. Create Durable Follow-Up State

When a PR is not merged, make the relationship easy to recover later:

- Apply existing state labels when they fit the classification.
- Comment on the PR with the blocker, evidence, and linked issue if a durable explanation is not
  already present.
- Create a follow-up issue for required migration work, failed validation needing investigation, or
  a concrete feature opportunity with repository-specific value.
- Link the issue back to the dependency PR and include a conventional-commit-style footer such as
  `Ref: #123` for the related PR or issue. Prefer neutral relationship language like `Related PR` or
  `Follow-up for`; avoid `Fixes:` or `Closes:` unless that closing relationship is intentional.

Follow-up issues should include:

- Dependency name, old and new versions, ecosystem, and PR link.
- Release-note or changelog evidence, with source links when available.
- Expected repository impact and files, commands, or workflows likely involved.
- Suggested next action and validation needed.
- Whether the issue is required migration work, investigation, or optional feature adoption.

Do not create issues for routine minor notes or generic feature lists without a concrete reason this
repository should care.

### 6. Merge Ready PRs

Merge only through the repository's normal forge path and merge strategy. Before merging, verify:

- The PR still targets the intended branch and has not changed since inspection.
- Required checks and reviews are passing or explicitly not required by repo policy.
- No linked blocker, migration issue, or release-note finding makes the PR unsafe as-is.

Merge ready PRs serially. After each successful merge, expect the base branch to move; wait for the
next PR's mergeability and required checks to recalculate, then re-verify it before merging. Do not
merge multiple PRs in parallel unless the forge has an explicit merge queue or batching mechanism
that owns that recalculation.

If merge permissions fail, inspect authentication and repository permissions before considering any
local workaround. Do not merge locally unless the user explicitly asks for that fallback.

### 7. Sync Local State

After successful merges, sync local state only when the worktree is clean or the user explicitly
approves working around local changes.

Prefer the repository's canonical runtime and package-manager workflow:

- Fast-forward the default branch.
- Install or activate pinned runtimes.
- Refresh dependencies from existing lockfiles using frozen, locked, or equivalent install modes,
  unless the user asked to regenerate locks or the repository's dependency policy assigns lock or
  transitive refresh to routine maintenance.
- Run the smallest complete validation gate defined by the repository.

When a refresh does regenerate locks, prefer commands that leave manifests untouched. Update
commands in several package managers rewrite declared version specs as a side effect, which silently
violates a repository's bound posture. Verify the flag against the tool's own `--help` rather than
assuming.

Keep local environment refresh separate from source edits. If install or validation fails, report
the failing command, classify the remaining work, and create durable follow-up state when
appropriate.

### 8. Refresh Repo-Pinned Tooling

Treat an explicit invocation of this skill as a full maintenance pass unless the user narrows the
scope. In a full maintenance pass, inspect and refresh repo-pinned tools that dependency bots may
not cover:

- Runtime pins, package-manager pins, tool lockfiles, CI setup actions, plugin versions, and
  repository-local updater policy.
- Existing dependency bot coverage to avoid duplicating work.

If the user narrows scope to dependency PR triage only, skip tooling updates and say what was
skipped. Otherwise, do this work after dependency PR decisions and merges are complete, keep it in a
separate local-change phase, and validate it through the repository's canonical install and check
workflow.

When a tooling update changes tracked project state, include every generated manifest, version-pin,
lockfile, and related metadata change needed to make the update reproducible. Check for sibling
surfaces pinning the same tool — a tool lockfile, a `packageManager` field, `engines`, a version
file, or a CI setup action can each pin one tool and drift apart in a single update. Create a small
maintenance PR through the repository's normal branch, commit, and forge workflow, then merge it
after its required checks pass and the diff remains limited to the repo-pinned tooling update. If
local validation, PR creation, checks, or merge permissions fail, leave the PR or branch with
durable blocker context instead of forcing the change through another path.

If an update would require migration, policy changes, major runtime changes, or unrelated source
edits, create a follow-up issue with the current version, available version, ownership surface,
reason to update, and suggested validation instead of broadening the maintenance PR.

### 9. Establish a Missing Dependency Policy

Only when the user asked for a written dependency policy, either up front or after discovery
reported the gap. Existing updater configuration does not satisfy this request; it is one of the
inputs the policy should describe. Read [POLICY-SETUP.md](references/POLICY-SETUP.md) and follow it.

Write the policy from the repository's real manifests, lockfiles, updater configuration, and CI, not
from the defaults in this skill. Where a decision is genuinely open — bound posture, cooldown
length, what stays manual — ask the user rather than choosing for them.

Land the policy document and its pointer as their own change, never folded into a dependency or
tooling PR. When this step runs as part of a full maintenance pass, do it after PR triage and any
tooling refresh are complete.

## Final Report

Always report:

- Which repository policy applied, and any point where it overrode a default in this skill.
- Whether the repository has a written dependency policy, and if not, that one can be established on
  request.
- The policy document written, if step 9 ran, and which decisions came from existing configuration
  versus the user.

When the maintenance pass ran, also report:

- PRs merged and the evidence that made them safe.
- PRs left open, their classification, labels/comments/issues created, and next action.
- Release-note findings for major/minor bumps, including breaking changes and concrete useful
  features.
- Local sync and validation results, including commands run and failures.
- Tooling updates discovered, any local-update PRs created or merged, and any follow-up issues
  created.
- That no unsafe or blocked PRs remain, when that is the case.

Do not make claims about the dependency queue on a policy-only run. Say the queue was not inspected
and offer the maintenance pass instead.
