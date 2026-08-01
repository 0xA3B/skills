---
name: create-pr
description: >-
  Prepare and create or refresh a GitHub pull request or GitLab merge request from the current
  branch. Use only when explicitly invoked after local review is complete and the user wants
  operational branch preparation, validation, push, change-request creation, and initial CI
  observation. Do not use for code review, review-feedback handling, merging, or conflict
  resolution.
license: MIT
disable-model-invocation: true
argument-hint: "[target|instructions]"
---

# Create PR

Prepare a branch operationally and create or refresh its change request. Explicit invocation means
the user considers local review complete; do not repeat code-review workflows.

## Outcome

Finish with one open, non-duplicate change request whose source head is committed, validated,
pushed, and assessed against its target. Report a precise blocker instead when conflicts,
authorization, validation, or forge state prevent that outcome.

## Authority And Boundaries

- Create a topic branch when the current branch is the target branch.
- Apply `git-workflows:commit` to intended uncommitted changes before publishing.
- Push normally after validation.
- Rebase unpublished topic history when the merge policy selects rebase and the operation is
  conflict-free.
- Require explicit authorization before rewriting any remote history. When authorized, fetch first
  and use `--force-with-lease`, never `--force`.
- Never resolve merge or rebase conflicts, rebase a target branch onto a topic branch, bypass hooks,
  perform code review, or merge the change request.

## Forge And Target

Use **Change request** for the forge-neutral object. Use **Pull request** in the GitHub lane and
**Merge request** in the GitLab lane.

Resolve the forge from the selected remote. Support GitHub through `gh` and GitLab through `glab`;
stop on another or ambiguous forge. After selecting the forge, read exactly one forge reference:

- [GITHUB.md](references/GITHUB.md)
- [GITLAB.md](references/GITLAB.md)

Resolve the target in this order:

1. user-specified target;
2. target of an existing open change request for the topic branch;
3. repository or branch-specific merge-base configuration;
4. the remote repository's default branch.

Fetch and prune the selected remote before comparing heads.

## Workflow

### 1. Establish A Topic Branch

Inspect branch, worktree, upstream, remotes, in-progress Git operations, and existing change
requests. Stop during an unresolved merge, rebase, cherry-pick, or revert.

If currently on the target branch, create a topic branch before committing. Preserve local commits
and changes; do not move or reset the target ref merely to make branch creation convenient. Follow a
repository branch-naming convention when one exists. Otherwise infer a concise type-and-purpose name
from the intended change, asking only when the intent is genuinely ambiguous.

Apply `git-workflows:commit` to all intended uncommitted changes. Continue only with a clean
worktree. If an open change request already exists for the topic branch, reuse it; never create a
duplicate. A closed or merged change request is not reusable without an explicit user decision.

### 2. Select A Merge Path

Select the expected merge method in this order:

1. repository-enforced policy;
2. explicit user choice;
3. true fast-forward when the forge supports it;
4. rebase when linear history is preferred and commit identity is disposable;
5. merge commit when the branch is shared, signed commits or stable commit identities matter,
   durable files reference topic commits, or rebase is unsuitable;
6. squash only when explicitly justified by one semantic unit or unusable branch history.

Search tracked and non-ignored untracked text for exact full or unambiguous abbreviated SHAs that a
rebase would rewrite. Start with changed files and likely durable surfaces such as documentation,
changelogs, configuration, and release metadata, then use bounded repository-aware text search.
Exclude binary, generated, dependency, and cache trees. If credible coverage is impractical, select
a merge commit and report the uncertainty.

Treat a durable match as a commit-identity requirement and select a merge commit. Inspect ignored
text only when repository guidance, the invocation, or a known handoff artifact identifies it;
record any matching local paths and SHAs for `merge-pr` cleanup rather than crawling ignored trees.

Test rebase and final-merge feasibility without leaving the working branch partially rewritten. When
rebase conflicts but the forge can merge the unchanged topic cleanly, retain the branch and select a
merge commit. When the selected path requires conflict resolution, restore the original state,
report the conflicting commits and files, and stop. Conflict resolution changes reviewed content and
belongs outside this operational workflow.

### 3. Validate And Publish

Run the repository's documented full pre-PR or local validation gate. When no full gate is defined,
use the established project script surface to run the smallest credible format, lint, typecheck, and
test set for the whole proposed change. Do not bypass hooks or weaken validation to publish faster.

After validation:

1. push the topic branch;
2. create or refresh the change request through the selected forge lane;
3. use repository templates and forge defaults for title and body;
4. do not impose a universal description format;
5. create a ready-for-review change request unless the user explicitly asks for a draft;
6. record the change-request URL, target, and exact source-head SHA.

### 4. Observe Initial CI

Observe required CI for the published head. Use ten minutes without observable job, step, log, or
state progress as a soft inactivity timeout. Continue beyond ten wall-clock minutes while CI is
clearly advancing. Stop immediately on a failed, errored, or demonstrably stalled required check.

A timeout reports the exact pending checks and preserves the change request. It does not cancel CI
or claim that validation failed.

## Completion And Hand Off

Report:

- forge, change-request URL, source head, and target;
- whether the request was created or reused;
- expected merge method and any identity constraint;
- ignored SHA references recorded for later cleanup;
- commits created and push mode used;
- local validation and initial CI state;
- blockers or pending work.

If the head was published and automated review adapters are expected, stop and recommend this exact
next invocation:

```text
$git-workflows:address-pr-feedback
```

If target drift later changes mergeability, rerun this skill against the existing change request.
