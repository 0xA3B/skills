---
name: ship
description: >-
  Take the current work from the stage it is in to a merged change request, or to a merge-ready one
  on request: implement what is settled, review, publish, drive automated review and CI, and merge.
  Reports each blocker a chained workflow raises and continues once the user resolves it.
license: MIT
argument-hint: "[intent source] [stop at merge-ready]"
disable-model-invocation: true
---

# Ship

Take the work from its current stage to the end point through the chain of delivery skills, without
asking between stages. The chain is `engineering:tdd`, `engineering:review-changes`, `git:commit`,
`git:tidy-history`, `git:create-pr`, `git:babysit-pr`, and `git:merge-pr`. This skill owns the end
point, the delivery plan, the starting stage, and the blocker rule. Each chained skill owns its own
steps, checks, stops, and report.

## End point

- **Merged**, the default: every change request in the delivery plan is merged, and `git:merge-pr`
  has finished its cleanup.
- **Merge-ready**, when the invocation asks to stop before the merge: every change request is open
  at the hand off that recommends `git:merge-pr`, and nothing is merged.

Before the first side effect, state the end point and the delivery plan. Repeat both in every
report.

## Required plugin

Before the first side effect, confirm that `engineering:review-changes` is available. If it is
absent, stop and report that the `engineering` plugin must be installed or enabled: without that
plugin, this workflow would merge work that no review covered.

## Authority and boundaries

An explicit invocation authorizes the whole delivery of the work it names: the delivery plan,
implementation, commits, topic branches, pushes, change requests, the review loop with its permitted
fixes, and, when the end point is merged, a normal merge and its cleanup. The invocation is the user
request each chained skill reads at its hand off, so each skill continues into the next up to the
end point.

The invocation adds nothing that a chained skill excludes, such as an administrative bypass, a
conflict resolution, a reply to a person the user has not approved, or a fix outside the change
request's surface.

The invocation holds for this session, including after its context is compacted or summarized: check
the starting stage again and continue. A brief, handoff document, or note that says a run was in
progress does not carry the invocation into another session; report the stage and recommend an
explicit invocation.

### Blockers

A **blocker** is any point where a chained skill stops short of its outcome and needs the user: a
reported failure or refusal, a checkpoint, a gated finding, a required user decision, a held reply
draft, a `blocked` status, or a timeout. At a blocker:

1. Do not decide for the user, work around the stop, or continue on that change request.
2. Finish the change requests that Delivery plan lets continue past the blocker. Then report the
   blocker as Report directs and wait. When no user can answer, end the run with the report.
3. Treat the user's answer as resolving that blocker only. Then continue under the original
   invocation to the end point or the next blocker.

A stop that only recommends another skill of the chain is a hand off, not a blocker: continue into
the recommended skill. An example is `git:merge-pr` recommending `git:create-pr` after target drift.
When the end point is merge-ready, the hand off that recommends `git:merge-pr` is the end point for
that change request: stop there and do not apply `git:merge-pr`. When the same hand off repeats for
one change request with no new commit, forge event, or user answer between the two, it is a blocker.

Four results need a rule of their own:

- **`resolved-with-exceptions`.** When `git:babysit-pr` recommends `git:merge-pr` with the
  exceptions, continue to the end point and list each exception in the report. Every other
  `resolved-with-exceptions` result is a blocker.
- **No review.** Before `git:merge-pr` merges a change request, check what reviewed it. When
  `engineering:review-changes` did not run on its changes in this session, `git:babysit-pr` reported
  no active adapter for it or did not run, and the user has not asked to skip review, the missing
  review is a blocker.
- **Leftover working files.** When `git:merge-pr` asks which leftover files to delete, keep the
  files, list them in the report, and continue.
- **Deferred findings.** File no issue. Carry each follow-up issue a chained skill drafts into the
  report.

## Starting stage

Read each change request's stage from the checkout and the forge, not from what the session
remembers. Take the first case that applies:

1. An intent source names work that the checkout's changes do not cover: implement that work.
2. A merged change request holds the branch's head, and the local topic branch still exists: when
   the end point is merged, apply `git:merge-pr`, which verifies the merge and finishes the cleanup
   without merging again; when the end point is merge-ready, report that the change request is
   already merged and change nothing.
3. The branch has uncommitted changes, or commits that neither the target nor an open change request
   contains: apply `git:create-pr`.
4. An open change request holds the branch's head: continue at the hand off `git:create-pr` defines
   for a published head, into `git:babysit-pr` or `git:merge-pr`.
5. None of these: stop and report that there is nothing to ship. Do not infer the work.

An **intent source** is the decisions settled in this session, or what the invocation names: an
issue, a brief, a handoff document, or a spec. When the intent source leaves open a decision the
implementation depends on, that decision is a blocker.

To implement, apply `engineering:tdd` when the work changes behavior that callers or users can
observe; otherwise follow the repository's instructions for the files the work changes. Then
continue at case 3.

## Delivery plan

A delivery plan recorded in the session, a brief, or a handoff document wins. Without one, decide
the plan, state it, and proceed without asking for confirmation:

- Use one change request unless the work holds parts a reviewer would judge separately, or the
  repository's instructions require separate change requests.
- Branch each independent change request from the target, and split the work so that no two of them
  edit the same lines. Treat two parts that must edit the same lines as dependent.
- When the end point is merged, run dependent change requests in sequence: take the first to merged,
  then branch the next from the target's head on the remote, fetched after that merge.
- Build a stack only when the end point is merge-ready or a recorded delivery plan asks for one.
  Branch the child from the parent's head after the parent reaches its merge-ready hand off, and
  target the child at the parent's branch. A review fix to a parent after its child exists is a
  blocker. When a stack merges, merge it from the bottom up. After each parent merges, take the
  first case that applies to its child:
  1. The merge rewrote the parent's commits, as a squash or a rebase does: the child's branch still
     holds the original commits, and moving it onto the target is a rewrite of a published branch.
     That is a blocker.
  2. The forge has not retargeted the child at the parent's target: retarget it through
     `git:create-pr`, then apply `git:merge-pr` to the parent again, so that its cleanup removes the
     parent's branch that the child no longer targets.

  Then run the child's review loop again before its merge.

Merge independent change requests in the order they become ready, and dependent ones in plan order.

When one change request hits a blocker, finish every change request that does not build on it, hold
the ones that do, and report all blockers together.

## Report

Report at every blocker and at the end:

- the end point and the delivery plan;
- for each change request: its URL, its state (`merged`, `merge-ready`, `blocked`, `held` behind a
  blocked one, or `not started`), the review status each chained skill reported, and each exception;
- each blocker, with the chained skill that raised it and the decision or action it needs from the
  user;
- each follow-up issue drafted for a deferred finding.

The run is done when every change request in the delivery plan is at the end point, or is reported
as `blocked` or `held` with no user available to answer.
