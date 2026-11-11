---
name: create-pr
description: >-
  Create or update a GitHub pull request (PR) or GitLab merge request (MR) from the current branch:
  prepare the branch, validate, push, write the title and description, and observe initial CI. Use
  when the user asks to create, open, or publish a PR or MR, or to add or push changes to an
  existing one, including as the last step of a request such as "commit, push, and open a PR". Do
  not use for editing only a PR's title or description, drafting a description without publishing,
  or validating without publishing.
license: MIT
argument-hint: "[target|instructions]"
---

# Create PR

Prepare a branch operationally and create or refresh its change request.

## Outcome

Finish with one open, non-duplicate change request whose source head is committed, validated,
pushed, and assessed against its target. Report a precise blocker instead when conflicts,
authorization, validation, or forge state prevent that outcome.

## Authority and boundaries

- Push normally after validation.
- Rebase unpublished topic history when the merge policy selects rebase and the operation is
  conflict-free.
- Tidy topic history through `git:tidy-history`. Require explicit authorization before any other
  rewrite of remote history. When authorized, fetch first and use `--force-with-lease`, never
  `--force`.
- Never resolve merge or rebase conflicts, rebase a target branch onto a topic branch, bypass hooks,
  perform code review, or merge the change request.

## Forge and target

Use **Change request** for the forge-neutral object. Use **Pull request** in the GitHub lane and
**Merge request** in the GitLab lane.

Select the remote that hosts the target: the remote the user names, else the remote whose repository
an open change request targets, else the only remote; when several remotes remain, stop for a user
decision. Resolve the forge from the selected remote. Support GitHub through `gh` and GitLab through
`glab`; stop on another or ambiguous forge. After selecting the forge, read exactly one forge lane:

- GitHub remote: read [GITHUB.md](references/GITHUB.md) for `gh` inspection fields, create and
  refresh commands, and merge semantics.
- GitLab remote: read [GITLAB.md](references/GITLAB.md) for `glab` inspection fields, create and
  refresh commands, and merge semantics.

Resolve the target as [TARGET-BRANCH.md](../../references/TARGET-BRANCH.md) directs. Fetch and prune
the selected remote before comparing heads.

## Workflow

### 1. Establish a topic branch

Inspect branch, worktree, upstream, remotes, in-progress Git operations, and existing change
requests. Stop during an unresolved merge, rebase, cherry-pick, or revert.

If currently on the target branch, create a topic branch before committing. Preserve local commits
and changes; do not move or reset the target ref merely to make branch creation convenient. Follow a
repository branch-naming convention when one exists. Otherwise infer a concise type-and-purpose name
from the intended change, asking only when the intent is genuinely ambiguous.

Apply `git:commit` to all intended uncommitted changes without pushing; step 3 publishes the branch.
Continue only with a clean worktree. If an open change request already exists for the topic branch,
compare its target with the resolved target. Reuse it only when they match. When the user explicitly
selected a different target, retarget through the forge lane, refetch its metadata, and reassess its
diff and mergeability. Stop for a user decision on any other mismatch; never create a duplicate. A
closed or merged change request is not reusable without an explicit user decision.

Step 1 is done when the worktree is clean on a topic branch, the resolved target is fixed, and
either a reusable open change request is identified or none exists.

### 2. Select a merge path

When selecting the expected merge method, read [MERGE-METHOD.md](../../references/MERGE-METHOD.md)
and apply its selection order. Run its durable-SHA search only when the selected path would rebase
or squash topic commits.

For a rebase or squash path, inspect ignored text only when repository guidance, the invocation, or
a known hand-off artifact identifies it. Record matching local paths and SHAs for `git:merge-pr`
cleanup rather than crawling ignored trees.

Test the selected path's feasibility without leaving the working branch partially rewritten. When
rebase conflicts but the forge can merge the unchanged topic cleanly, retain the branch and select a
merge commit. When the selected path requires conflict resolution, restore the original state,
report the conflicting commits and files, and stop.

Step 2 is done when the expected merge method is recorded and the branch is at its original head;
the forge performs a selected rebase at merge.

### 3. Validate and publish

Run the repository's documented full pre-PR or local validation gate. When no full gate is defined,
use the established project script surface to run the smallest credible format, lint, typecheck, and
test set for the whole proposed change. Do not weaken validation to publish faster.

Before publishing, author the change request from the initiating request, linked issues or tickets,
the effective diff, and the decisions that shaped the final solution:

- Treat repository title rules and title or description templates as project conventions. Preserve
  their required structure and fields.
- When the repository does not define a title convention, write a Conventional Commit title for the
  change request's overall outcome. Keep issue and ticket identifiers out of the title.
- Apply `writing:technical-writing` to the description when that skill is available; it owns the
  prose and its change-description reference. Start with why the change exists, then describe the
  overall solution and why it was chosen. Do not inventory commits or files.
- Write a review bot's name without the `@` prefix in the title and description; a mention can start
  that bot's task.
- Name intentional boundaries, reviewer-sensitive risks, migrations, rollout needs, and follow-up
  work when they affect review or use.
- When the target is the repository's default branch and the change fully resolves an issue, add the
  forge's closing form such as `Closes #123`. For related work that remains open, use the project's
  reference form such as `Refs: #123`, a ticket key, or a link. Follow the external tracker's
  convention when it differs.
- Include validation evidence only when it adds information beyond required CI, such as manual
  behavior checks, local checks not represented in CI, checks not run, or known failures.

Write the description's body file, and any other draft this workflow keeps on disk, in a directory
named for the topic branch under the scratch location the repository's instructions name; without
such a location, use the system temporary directory.

After authoring:

1. apply `git:tidy-history` to the topic branch against the resolved target; it keeps the validated
   tree, and when it refuses or stops, continue with the history it left and report its reason;
2. push the topic branch normally when `git:tidy-history` did not publish it;
3. create the change request through the selected forge lane with the authored title and completed
   description, or refresh an existing one's title and description when they no longer match the
   effective diff, ready for review unless the user explicitly asks for a draft.

Record the change-request URL, target, and exact source-head SHA.

### 4. Observe initial CI

Observe required CI for the published head. Use ten minutes without observable job, step, log, or
state progress as a soft inactivity timeout. Continue beyond ten wall-clock minutes while CI is
clearly advancing. Stop immediately on a failed, errored, or demonstrably stalled required check.

A timeout reports the exact pending checks and preserves the change request. It does not cancel CI
or claim that validation failed. Step 4 is done when every required check on the published head has
passed, or a stop or timeout above is reported.

## Completion and hand off

Report:

- forge, change-request URL, source head, and target;
- whether the request was created or reused;
- expected merge method and any identity constraint;
- ignored SHA references and working artifacts recorded for `git:merge-pr` cleanup;
- commits created, history changes `git:tidy-history` made, and push mode used;
- local validation and initial CI state;
- blockers or pending work.

After publishing the head, stop. When the forge is GitHub and the user's request asked for the
review loop, or asked for the merge and the change request or its repository shows automated review
activity, continue into `git:babysit-pr`; when the request asked for the merge otherwise, continue
into `git:merge-pr`. Otherwise recommend `git:babysit-pr` on GitHub or `git:merge-pr` on GitLab.
