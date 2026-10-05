---
name: tidy-history
description: >-
  Rewrite a topic branch's unmerged commits so each has one logical purpose, a sensible rollback
  boundary, and a valid message, without changing the branch's final tree, then publish the result
  with a lease. Use when the user asks to tidy or clean up branch history; to squash, fold, reorder,
  split, reword, or amend existing commits, including amending working-tree changes into one; to
  fold review fixes into the commits they correct; or when another git skill directs applying
  git:tidy-history. Do not use for committing changes as new commits, rebasing a branch onto an
  updated target, resolving conflicts, squash-merging a pull request, inspecting history, or
  conceptual questions about rebasing.
license: MIT
argument-hint: "[range|review|instructions]"
---

# Tidy history

Rewrite a topic branch so its history reads as a sequence of logical changes. Tidy does not mean
minimal: keep every commit that is its own rollback boundary.

## Outcome

Finish in one of these states:

- the rewritten branch ends on the exact tree it had before, sits on the same base, and is published
  with a lease when it has a published ref;
- the history already meets the plan rules, and nothing was rewritten;
- review mode reported the plan without rewriting;
- a precise refusal or blocker is reported, and the branch is at its pre-tidy head.

## Invariants

These invariants define what this skill does; a request that asks for something outside them asks
for work this skill does not perform. When the user's request conflicts with an invariant, keep the
invariant, and report the conflict and the closest result the invariant allows.

- **Same tree, same base.** The rewritten branch ends on the recorded tree and sits on the recorded
  base. When an instruction would change the tree, such as dropping a commit that changes files,
  fold that commit instead and say why. Content changes belong to `git:commit`; base changes, such
  as a rebase onto an updated target, belong to `git:create-pr`.
- **Protected branches stay as they are.** A **protected branch** is `main`, the remote's default
  branch, or the change request's target. Read the default branch from
  `git ls-remote --symref <remote> HEAD`, because `git fetch` leaves a stale local
  `refs/remotes/<remote>/HEAD` in place. A branch whose published ref names a protected branch on
  the remote is protected too, because the push would update that branch. On a protected branch, run
  review mode, even in a solo repository or when the user asks to rewrite the branch anyway, and
  give the rewrite commands when the user asks for them.
- **Lease-only publishing.** Publish only with `--force-with-lease=<remote-branch>:<recorded-sha>`;
  step 4 says how to recover from a failed push. This skill never runs a plain `--force`.
- **No conflict resolution.** Resolve no conflicts; step 3 says how to back out of one.

## Modes

Any invocation, explicit or implicit, and any application by another git skill authorizes fix mode:
rewriting the topic branch and publishing it under the invariants. Run review mode instead on a
protected branch, when the request asks only for the plan, such as a dry run or "what would you
change", or when another skill applies this one in review mode.

## Refusals

Refuse, naming the evidence, when:

- a merge, rebase, cherry-pick, or revert is in progress;
- the branch is checked out in another worktree;
- in fix mode, the backup ref `refs/tidy-history/<branch>` points at a commit the local head does
  not contain, because it holds an earlier run's restore point;
- in fix mode, the worktree has tracked changes the request does not cover, because the rebase needs
  a clean worktree;
- in fix mode, an ignored path from `git ls-files --others --ignored --exclude-standard --directory`
  collides with a path a range commit touches, from
  `git log --format= --name-only <base-commit>..HEAD`, or a path the intended changes touch, from
  `git diff --name-only HEAD`: the paths are equal, or one is a directory containing the other.
  Replaying those commits deletes or overwrites ignored files without warning;
- a commit in the range has an author email other than the one `git var GIT_AUTHOR_IDENT` reports;
- the range contains a merge commit, because the rewrite would linearize commits the target owns;
- another local branch, or a remote-tracking branch other than the published ref, contains a commit
  of the range, or the forge reports an open change request that targets the branch, because
  rewriting would duplicate or orphan work another branch holds;
- the forge reports the branch's change request merged.

## Workflow

### 1. Establish the range

Fetch the branch's remote. Resolve the target: the user-specified target, the open change request's
target, then the remote's default branch. Resolve the range: from the oldest commit the user names
through the local head, because the rebase replaces every later commit too, or else the commits
since the merge base with the target. Resolve the **published ref**: the branch's configured
upstream, or else `<remote>/<branch>` when the remote has a branch of that name; its branch name on
the remote is `<remote-branch>`, and a branch with neither is unpublished. Record the base commit,
which is the parent of the range's oldest commit, and the published ref's head as `<recorded-sha>`.
When that head is not an ancestor of the local head, stop: the remote holds commits the local branch
lacks.

Run the durable-SHA search in [MERGE-METHOD.md](../../references/MERGE-METHOD.md) over the range;
when a durable match requires stable commit identity, stop for a user decision.

When no refusal or check above stops the run, in fix mode, apply `git:commit` to intended
uncommitted changes; in review mode, plan over the committed range and report the uncommitted paths.
Then record the local head and its tree; the range runs through that head.

Step 1 is done when the range and every recorded value are fixed, no refusal applies, and, in fix
mode, the worktree is clean.

### 2. Plan

Judge each commit in the range by `git:commit`'s partitioning rules and commit message policy. Plan
these changes, each with a one-line reason:

- **fold** a commit that corrects an earlier commit in the range, such as a review fix or a format
  pass, into the commit it corrects, unless it stands alone as its own rollback boundary. Fold every
  `fixup!` commit, because `git:commit` makes one only for a correction, into the commit its subject
  names by subject or full SHA; when several commits in the range share that subject, find the
  target from the lines the fixup changes. Reword a `fixup!` commit that an explicit user
  instruction keeps separate;
- **split** a commit that mixes units the partitioning rules separate;
- **reorder** commits into dependency order when a fold or split needs it;
- **reword** a message that misdescribes its commit or breaks the message policy;
- **drop** an empty commit.

Follow an explicit user instruction about grouping, such as "squash these three into one", over the
partitioning rules.

When the plan is empty, report that the history is already tidy and stop. In review mode, report the
plan and stop:

```text
Range: 3f1c2a0..9d84e1b on feat/retry (base 3f1c2a0)
- fold   b71e04d "fix: address review feedback" -> 52aa9c3: corrects the retry cap in that commit
- reword 52aa9c3 "feat: add retry and logging and docs" -> "feat(client): retry stalled requests":
  the commit adds retries only
- keep   9d84e1b "test(client): cover the retry cap": own rollback boundary
```

### 3. Rewrite

When the agent's commands run in a sandbox, run every `git rebase` command outside it, including
`--continue` and `--abort`: the rebase writes and deletes files across the worktree and runs the
commit signer, and a sandbox that blocks either stops the rebase partway.

1. Set the backup ref `refs/tidy-history/<branch>` to the local head.
2. When every planned change folds a `fixup!` commit whose subject names exactly one commit in the
   range, run `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base-commit>`; Git writes that
   plan as the todo, and would fold a subject several commits share into the oldest. Otherwise,
   write the plan as a rebase todo that uses only `pick`, `fixup`, `drop`, `edit`, and `exec`; the
   message-taking verbs read the message from an editor, which a non-interactive run cannot supply.
   Write each new message to a file, check it as `git:commit` directs, and set it with
   `exec git commit --amend --file=<message-file>` after the commit and its `fixup` lines. Run
   `GIT_SEQUENCE_EDITOR="cp <todo-file>" git rebase -i <base-commit>`.
3. When the repository documents a fast check, such as a typecheck and unit tests, run it after
   every commit the rebase writes: pass `--exec "<check>"` to an autosquash rebase, or add an
   `exec <check>` line after each commit's last line in a written todo, which replaces the lines
   `--exec` would add.
4. Mark a commit `edit` to split it: at the stop, run `git reset HEAD^`, commit each unit under
   `git:commit`'s partitioning, message, and staging rules, run the fast check from item 3 after
   each ordinary commit and handle a failure as item 5 handles a failed check, and continue with
   `GIT_EDITOR=true git rebase --continue`. Those rules commit a unit that corrects an earlier
   commit as a `fixup!` commit, which this rebase cannot fold; after it finishes, run the autosquash
   rebase from item 2 as a second pass under the same backup ref, whose `--exec` checks the commits
   those units fold into.
5. On a conflict, run `git rebase --abort` and drop the reorder that caused it from the plan. When
   the plan still conflicts without reorders, stop and report the conflicting commits. On any other
   stop than an `edit` stop, such as a failed check, hook, or signature, run `git rebase --abort`
   and stop with the error. After an abort in the second pass, run
   `git reset --hard refs/tidy-history/<branch>` before replanning or stopping.

Step 3 is done when every rebase the step started has finished and no rebase is in progress.

### 4. Verify and publish

Compare the new head's tree with the recorded tree, confirm the base commit is an ancestor of the
new head, confirm each message the plan set appears on its commit, and confirm no commit in the new
range has a subject that starts with `fixup!`, `squash!`, or `amend!`, because autosquash leaves a
commit whose subject names no commit in the range unfolded. On any difference, run
`git reset --hard refs/tidy-history/<branch>` and stop with the difference.

When the branch has a published ref, push with
`git push --force-with-lease=<remote-branch>:<recorded-sha> <remote> <branch>:<remote-branch>`. When
the push reports failure, read the remote head with
`git ls-remote <remote> refs/heads/<remote-branch>`, because a transport failure can follow a
successful update:

- the new head: the push succeeded;
- `<recorded-sha>`: reset the branch to the backup ref and stop with the rejection;
- any other commit: keep the branch and the backup ref, and stop with that remote head.

Delete the backup ref after the checks pass and the push succeeds, or after the checks alone for an
unpublished branch.

## Report

Report:

- mode, branch, target, base, and range;
- each planned change with its reason, and the old and new commit identifiers;
- the tree, base, and message check results;
- the push result with the lease value, or why nothing was pushed;
- when a change request exists and the head changed, that its reviews covered the old head;
- whether the backup ref remains and how to restore from it;
- every refusal or blocker with its evidence.
