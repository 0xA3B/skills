---
name: dependency-maintenance
description: >-
  Review dependency update PRs across package managers and forges, decide whether they are safe to
  merge, merge only ready updates, sync local dependency state, refresh repo-pinned tooling through
  small maintenance PRs, and create linked follow-up issues for breaking changes, validation
  failures, or useful new features. Use when the user asks to review Dependabot, Renovate, lockfile
  maintenance, security, runtime, package-manager, or other dependency update PRs.
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
- Decisions follow the repository's own dependency policy, and a missing or contradictory policy is
  reported as a distinct gap.

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
- Do not create or change dependency policy or updater configuration in this workflow. Updater
  configuration is classification evidence only. When an updater defect blocks dependency PRs,
  record the blocker, file a follow-up issue, and leave the PRs blocked; a user-authorized fix is a
  separate task, and after it lands, reclassify the affected PRs from their refreshed heads. Report
  the gap or conflict to the user at the end of the workflow.

Allowed side effects are limited to dependency PR review, safe dependency PR merges, local
fast-forward and install/runtime refreshes, PR labels/comments, follow-up issue creation, and
repo-pinned tooling update PRs for full maintenance passes.

## Workflow

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
policy exists, continue with these defaults, and mention it in the final report.

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

- `merge as-is`: every check run and commit status on the head is green, merge state is clean, diff
  scope is understood, and release-note review found no required migration. A green CI workflow with
  any other check run or commit status pending or failed is not green.
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

- For a dependency-specific issue: dependency name, old and new versions, ecosystem, and PR link.
- For an updater or configuration investigation: the affected managers and PRs, the repository
  policy invariant at stake, the observed status or log evidence, and reproduction or rerun steps.
- Release-note or changelog evidence, with source links when available.
- Expected repository impact and files, commands, or workflows likely involved.
- Suggested next action and validation needed.
- Whether the issue is required migration work, investigation, or optional feature adoption.

Do not create issues for routine minor notes or generic feature lists without a concrete reason this
repository should care.

When a blocker fix merges or a shared investigation issue closes while any dependency PR it covered
is still open, recheck those PRs: every PR left blocked must link to an open, actionable issue. File
a new issue for any unresolved remainder and update the PR's linked context.

### 6. Merge Ready PRs

Merge only through the repository's normal forge path and merge strategy. Before merging, verify:

- The PR still targets the intended branch and has not changed since inspection.
- Required checks and reviews are passing or explicitly not required by repo policy.
- No linked blocker, migration issue, or release-note finding makes the PR unsafe as-is.

Merge ready PRs serially. After each successful merge, expect the base branch to move and updater
bots to produce new heads. A changed head or moved base invalidates the prior classification:
classify the new head again from its effective diff against the current base — original PR bodies
and prior release-note scope may be stale — then re-verify mergeability and checks before merging.
Do not merge multiple PRs in parallel unless the forge has an explicit merge queue or batching
mechanism that owns that recalculation.

When an open vulnerability alert is in scope, map it to the affected dependency path and vulnerable
range, identify which PR head actually contains the patched version, and merge that PR first.
Require any overlapping PR recalculated afterward to retain the patched version. After merging,
confirm the forge alert reaches its fixed state; a clean package-manager audit validates the fix but
does not substitute for the alert closing.

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

- Runtime pins, package-manager pins, tool lockfiles, CI setup actions, and plugin versions.
- Existing dependency bot coverage and updater configuration, to avoid duplicating work and to
  classify blocked PRs — not to repair updater behavior, which stays outside this workflow.

Treat a newer release as actionable only when repository dependency policy permits selecting it. A
release deferred by policy, such as one inside a cooldown window, needs no maintenance PR,
exception, or follow-up issue unless it is an urgent security fix.

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

## Final Report

Always report:

- Which repository policy applied, and any point where it overrode a default in this skill.
- Whether the repository has a written dependency policy and any gap or conflict discovered.

When the maintenance pass ran, also report:

- PRs merged and the evidence that made them safe.
- PRs left open, their classification, labels/comments/issues created, and next action.
- Release-note findings for major/minor bumps, including breaking changes and concrete useful
  features.
- Local sync and validation results, including commands run and failures.
- Tooling updates discovered, any local-update PRs created or merged, and any follow-up issues
  created.
- That no unsafe or blocked PRs remain, when that is the case.
