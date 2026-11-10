---
name: commit
description:
  Creates git commits using Conventional Commit messages after reviewing current changes and
  splitting logical units. Use when the user asks to commit current work, create commits, batch
  commits, commit only a selected scope or subset of the changes, or run a fast commit workflow.
  Also use when no repository commit convention is specified. Do not use for message-only drafting,
  syntax validation, split guidance without commit execution, conceptual commit questions, history
  inspection, amending or rewriting existing commits, user prompts or loaded repository instructions
  that reject Conventional Commits or request Gitmoji or another commit-message standard, or
  ordinary-language uses of "commit" such as committing to a plan.
license: MIT
argument-hint: "[instructions]"
---

# Commit

Commit the intended changes as new commits, each with one logical purpose and a message that follows
the repository's convention.

## Outcome

Finish in one of these states:

- every intended change is committed, each commit has one logical purpose and one rollback boundary,
  and each message passed the repository's commit rules;
- the commit plan and its messages are reported and nothing is staged, because the request asked for
  a dry run, a message draft, or split guidance;
- a precise blocker is reported: a merge or rebase in progress, conflicts, overlapping hunks that
  cannot be split into the planned units, or nothing to commit.

## Authority and boundaries

A request to commit authorizes staging and committing the intended changes without further
questions.

- **Scope.** A request that names a path or concern, such as "only the docs" or "skip the config",
  sets the scope. A request that names none, such as "commit" or "commit everything", covers all
  coherent current work for the task: leave out unrelated, pre-existing, and local-only artifacts,
  and include generated outputs when the work or repository policy requires them.
- **Push.** Push only when the request asks for it, with a plain `git push` that sets the upstream
  of a new branch. Report a rejected push; a force push belongs to `git:tidy-history`.
- **New commits only.** When a request needs an existing commit amended, reworded, folded, or split,
  commit the new content here and apply `git:tidy-history` to rewrite the history.
- **Hooks.** Pass `--no-verify` only when the user's request asks for it.
- **Ignored paths.** Stage tracked paths and non-ignored untracked paths. When the user names an
  ignored path, name the matching ignore rule and report that the repository's ignore policy must
  change before the path can be committed, instead of force-adding it.

The user's request and the repository's commit rules win over the message and partitioning defaults
below: a request for a single commit gets one commit.

## Commit messages

Before drafting, read the commit rules that apply: rules the user names, a commit linter config such
as commitlint or commitizen, a `commit-msg` hook, and written conventions in a CONTRIBUTING, AGENTS,
or CLAUDE file. When release tooling such as semantic-release, release-please, or
conventional-changelog is present, read enough of its config to know which types, scopes, and
breaking-change markers drive changelogs and version bumps.

- When the user or the repository names another message convention, write messages in that
  convention instead of the Conventional Commit rules in this section and its reference.
  Partitioning, the workflow, and the report still apply, with that convention's kinds of change in
  place of types. Otherwise write Conventional Commit messages:
  `<type>[optional scope][!]: <description>` with an imperative subject. Read
  [conventional-commits.md](references/conventional-commits.md) when a footer, a breaking-change
  marker, or the choice between two types is in doubt.
- Choose `feat`, `fix`, `!`, and `BREAKING CHANGE:` by release impact, not by the size of the diff;
  when release tooling is present, its rules decide. When the release impact is ambiguous and one
  reading is a breaking change, ask the user before committing; otherwise choose, and name the
  assumption in the report.
- Choose a scope from the change's intent or the repository's established scopes, not from a folder
  name.
- Name the resulting behavior, boundary, or user-visible outcome in the subject. Use a generic verb
  such as `update`, `tune`, or `refine` only when a more specific result would mislead.
- Add a body or an issue footer only for durable context specific to the commit. A body explains why
  the change exists; it does not restate the diff. Keep identifiers out of the subject unless
  repository policy requires them, and put a change request's overall reference on the change
  request, not on every commit.

## Partitioning

Split units that differ by:

- Conventional Commit type, such as `feat` and `fix`;
- scope, such as `api` and `ui`;
- rollback boundary, when one unit can be reverted without the other;
- target commit, for corrections.

Keep changes together when one behavior needs all of them and they would be reverted together.

A **correction** only fixes, completes, or formats lines that one commit introduced, where that
commit is on the topic branch and not on its target. Resolve and fetch the target as
[TARGET-BRANCH.md](../../references/TARGET-BRANCH.md) directs, and find that commit with `git blame`
or `git log -L` on the corrected lines. Commit each correction with
`git commit --fixup=<target-sha>`, one commit per target commit even when the parts are jointly
required. Git writes `fixup! <target subject>`, the subject `git:tidy-history` folds the correction
by, so the message rules above do not apply to it. When another commit on the topic branch has the
target's subject, commit with `git commit -m "fixup! <full-target-sha>"` instead, because autosquash
folds a shared subject into the oldest commit that carries it. A unit that adds behavior, or that
corrects a commit the target already contains, is an ordinary commit.

## Workflow

1. Inspect the staged changes, the unstaged tracked changes, and the untracked non-ignored files in
   scope.
2. Plan the commits: split the work into units by the partitioning rules, and choose each unit's
   message, or its target commit for a correction. For a dry run, a message draft, or split
   guidance, report the plan and stop here.
3. Commit the units in dependency order. For each unit:
   1. Check the drafted message. Run the repository's commit linter on it when the linter accepts a
      message from a file or stdin; otherwise check it against the rules read above.
   2. Stage the unit and confirm that `git diff --cached --name-only` lists only its files. Unstage
      any other path before committing.
   3. Run `git commit` as its own command, not chained with staging or another commit. A rejected
      commit leaves the unit staged; resolve the rejection before staging the next unit. When a
      sandbox blocks the commit, such as its signing, rerun the commit outside the sandbox.
4. Push when the request asked for it.

Step 3 is done when every intended change in scope is committed and the index is empty.

## Report

Report each commit created, each path left uncommitted with the reason, the push result when a push
was asked for, and each assumption that could change a commit's type, scope, breaking-change marker,
or partitioning.
