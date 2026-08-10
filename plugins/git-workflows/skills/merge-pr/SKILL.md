---
name: merge-pr
description: >-
  Merge a ready GitHub pull request or GitLab merge request and verify remote and local cleanup. Use
  only when explicitly invoked after review feedback is resolved and the user wants forge-native
  merge gates checked, a merge method selected, the terminal merge observed, branches cleaned up,
  and ignored SHA references refreshed. Do not use for creating change requests, handling review
  feedback, resolving conflicts, or bypassing protections.
license: MIT
disable-model-invocation: true
argument-hint: "[change-request|instructions]"
---

# Merge PR

Merge synchronously through the forge, verify the remote result, and clean up only state proven safe
to remove.

## Outcome

Finish in one of these states:

- the change request is remotely merged, its remote topic branch is deleted when permitted, local
  target state is safely synchronized, and the local topic branch is deleted;
- a required merge queue remains pending and no cleanup was attempted;
- a precise forge, protection, conflict, permission, or local-state blocker is reported.

This workflow is idempotent. When invoked for an already merged change request, skip merge execution
and perform verification and remaining cleanup.

## Authority and boundaries

Explicit invocation authorizes a normal policy-compliant merge and verified branch cleanup. It does
not authorize:

- administrative bypass of checks, approvals, branch protections, merge queues, or unresolved
  threads;
- adapter-specific review polling or feedback handling;
- conflict resolution, history repair, or target-branch rewriting;
- ordinary asynchronous auto-merge;
- force-deleting a local branch without the proof required below.

An administrative override of a forge protection requires an explicit same-invocation request naming
that protection and must still comply with loaded repository policy. Unresolved review threads are
not overrideable in this workflow; disposition and resolve them before merging.

## Forge selection

Resolve the forge from the change request or selected remote. Support GitHub through `gh` and GitLab
through `glab`; stop on another or ambiguous forge. Read exactly one forge reference after
selection:

- [GITHUB.md](references/GITHUB.md)
- [GITLAB.md](references/GITLAB.md)

This skill is adapter-blind. Adapter-specific outcomes belong to `address-pr-feedback` and its hand
off. Enforce adapter approval only when the forge exposes it as a required check or approval.

## Pre-merge gate

Fetch and prune the selected remote, then record the change-request URL, target, exact source-head
SHA, target head, local topic head, and relevant worktrees.

Before merging, require:

- an open, non-draft change request, unless it is already merged;
- a forge source head matching the reviewed and local source head;
- all required CI passing on that head;
- all required approvals present and no blocking review decision;
- every review thread resolved, regardless of author;
- a mergeable result under repository policy;
- a clean local worktree for any post-merge mutation.

Wait through required CI using ten minutes without observable job, step, log, or state progress as a
soft inactivity timeout. Continue while CI is clearly advancing. Stop immediately on failure or
error. Do not troubleshoot CI in this workflow.

When target drift makes the branch unmergeable or requires new commits, stop and recommend:

```text
$git-workflows:create-pr
```

After any head change, recommend an explicit `$git-workflows:address-pr-feedback` round before
returning to this skill.

## Merge method

When selecting the method, read [MERGE-METHOD.md](../../references/MERGE-METHOD.md) and apply its
selection order and durable-SHA search.

If the repository forbids the merge commit that a durable match requires, stop for a user decision.
Inspect ignored text only when repository guidance, the invocation, or the `create-pr` hand off
identifies a local artifact; record matching paths and SHAs without crawling ignored trees. Their
presence does not block rebase.

Merge through the forge with a head-SHA match guard. If the repository requires a merge queue,
enqueue only after current gates pass, then wait up to ten minutes — the queue timeout — for the
forge to report the actual merge. Reaching the queue timeout reports `queued, not merged` and
performs no cleanup.

## Remote verification

After the forge reports success:

1. refetch the target and change-request metadata;
2. verify the request is merged, not merely closed or queued;
3. verify the target contains the expected merge result under the selected method;
4. record the resulting target and merge commit identities;
5. check whether the remote topic branch still exists;
6. if it exists and permissions allow, delete it only after steps 1–4 succeed.

Do not infer success from a CLI exit code alone.

After a rebase or squash merge, if ignored SHA references were recorded, read
[IGNORED-SHA-REFERENCES.md](references/IGNORED-SHA-REFERENCES.md) before refreshing them. Leave
every reference unchanged unless that procedure proves its replacement.

## Local cleanup

Fetch and prune again after remote branch deletion. Update the local target only by fast-forwarding
it to the selected remote target. Do not touch a dirty, divergent, or other-worktree target; report
the remaining cleanup instead.

Delete the local topic with the normal safe deletion first. Rebase and squash may make Git reject
safe deletion because the original commits are not ancestors of the target. Use force deletion only
after proving:

- the forge reports the change request merged;
- the recorded forge head equals the local topic head;
- no local commits were added after that head;
- the fetched target contains the verified merged result;
- the worktree is clean and the branch is not checked out in another worktree.

If any proof is missing, preserve the branch.

## Completion

Report:

- forge, change-request URL, exact merged source head, target, and merge method;
- required checks, approvals, and thread-resolution evidence;
- terminal merge or queue state;
- remote branch deletion and fetched target state;
- ignored SHA references updated or left unresolved;
- local target update and topic-branch deletion;
- every cleanup item left for a later invocation.
