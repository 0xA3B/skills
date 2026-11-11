---
name: babysit-pr
description: >-
  Babysit a GitHub pull request (PR) through automated review: wait for review bots such as Codex or
  Copilot, triage their findings, push fixes, reply to and resolve their threads, and repeat until
  each bot approves the current head or an exception is reported. Use when the user asks to babysit
  a PR, to handle, address, or drive bot or automated review feedback on one, to wait for or poll a
  review bot, or to reply to and resolve its threads. Do not use for human review comments, CI
  repair, GitLab merge requests, or findings from a local or sub-agent review.
license: MIT
argument-hint: "[change-request|adapters|instructions]"
---

# Babysit PR

Drive authorized automated reviewers to a terminal outcome without treating their feedback as an
order or silently expanding edit authority.

## Outcome

Finish with every active adapter classified against the current source head, or against the last
head it reviewed when it converged or when the repository's review configuration reviewed no later
head:

- `approved`: the adapter gave its terminal clean signal on the current head, or on the last head
  the configuration reviewed;
- `resolved-with-exceptions`: all known findings are dispositioned, but the adapter gave no terminal
  clean signal;
- `round-limit`: all findings from the last permitted review round are dispositioned, but the
  adapter is neither `approved` nor converged;
- `timed-out`: the initial head, or a pushed head its adapter reference still awaits a review of,
  drew no acknowledgment in the acknowledgment window, or an acknowledged head drew no activity
  through the response timeout;
- `blocked`: missing prerequisites, user decisions, CI state, or unsupported behavior prevent
  continuation.

Do not call an exception or timeout green, or an approval on a head the configuration was still due
to review.

## Required feedback discipline

Before triage, confirm `engineering:receiving-feedback` is available and rates the consequence of
accepted findings, which the `engineering` plugin ships from 2.6.1. If the skill is absent, stop and
report that the `engineering` plugin must be installed or enabled; if the skill assigns no rating,
stop and report that the `engineering` plugin must be updated.

Apply `engineering:receiving-feedback` to every finding. This invocation permits fixing a finding
that discipline marks `accepted` or `auto-accepted` when the fix preserves behavior and stays within
the change request's own surface and tests; such a fix is a permitted fix. Gate everything else.

## Authority and boundaries

An explicit invocation of this skill, or a user request that asks to handle, address, or drive the
feedback, to resolve its review threads, or to request a follow-up review, authorizes for active
adapters polling, adapter-defined reactions and replies, thread resolution after disposition,
permitted edits, relevant validation, applying `git:commit` and `git:tidy-history`, normal pushes,
and the review requests an adapter defines, such as a transient-error retry. A request for a
follow-up review is answered by each adapter's follow-up protocol, which observes the repository's
review configuration and requests a review only where the adapter defines one. A request that asks
only to wait for, poll, or triage a review bot's findings authorizes polling and triage: classify
each finding, report the dispositions, and return `blocked` on the user's decision before any
reaction, reply, review request, thread resolution, edit, commit, or push.

Neither authorization extends to:

- handling feedback from an unknown source unless the initial prompt grants that authority or the
  user grants it when asked;
- bot-authored fixes such as asking a reviewer to change the branch;
- CI troubleshooting;
- force pushes or history rewriting outside `git:tidy-history`;
- merging the change request.

## Adapter selection

A **Review adapter** owns one bot and forge protocol. An **Available adapter** ships with this
skill; an **Active adapter** is selected for the current invocation.

Select active adapters in this order:

1. an explicit user-provided adapter or subset;
2. reliable current or prior change-request evidence for the repository;
3. the sole available adapter when exactly one ships.

Run all active adapters by default. When several adapters are available but evidence is ambiguous,
ask which are active instead of waiting for bots the repository may not use. When an adapter's
reference reports that the repository's review configuration does not cover the change request and
the adapter shows no activity on it, the adapter is not active for that change request: report it as
not configured, with that evidence, instead of classifying it.

Available adapters:

- [GITHUB-CODEX.md](references/GITHUB-CODEX.md)
- [GITHUB-COPILOT.md](references/GITHUB-COPILOT.md)

Load the reference for every active adapter before polling. Stop precisely when the current forge or
bot has no available adapter.

## Review loop

### 1. Establish current state

Resolve the change request, its forge-side base repository or project, and its exact source-head
SHA, then fetch the topic branch. Use the resolved forge-side target explicitly in API and CLI
commands; the current checkout may be a fork. Confirm the request is open and not draft. Snapshot:

- adapter acknowledgments, reviews, comments, reactions, and approval signals;
- review comment and thread IDs already present;
- unresolved feedback from all sources;
- required CI state.

For paginated review, comment, or thread connections, fetch every page before classifying their
state. A first page cannot prove that every finding is dispositioned.

Treat feedback from a source with no active adapter as unknown. Surface each unresolved unknown
thread as a user gate unless the invocation already authorized handling unknown feedback.

### 2. Poll active adapters

Poll once per minute. Each adapter defines which signals count as acknowledgment, progress,
findings, and current-head approval; when its reference ships a polling script, run that script as
the reference directs instead of assembling the poll from separate commands.

Run a polling script so that its final `exit=` line reaches you. When the agent's harness re-invokes
the agent after a background command exits, run the script in the background. Otherwise run it in
the foreground with the command timeout set above its longest run: two poll budgets of
`interval-seconds` times `max-polls`, plus the acknowledgment window. When the harness caps the
timeout below that, pass a smaller `max-polls`, rerun on exit `5`, and count every run toward the
response timeout. Run the script unsandboxed, because `gh` reads credentials from the keyring. After
a push, set `EXPECT_HEAD` to the full pushed SHA: the forge can report the earlier head for minutes,
and the script then waits for the pushed head instead of classifying the earlier one. The scripts
need `gh` and `jq`; when the output names a missing dependency, stop and report it to the user
instead of installing it.

Before starting or advancing either timer, prove that the observation channel can fetch a
known-present change-request field such as the current source head. Treat a command error or an
unexpectedly missing field as an observation failure, not inactivity. Retry one plausibly transient
failure; if observation remains broken, return `blocked` without diagnosing or repairing the
environment in this workflow.

Two windows govern the wait. The acknowledgment window is two poll intervals after a head is
published: when no adapter-defined acknowledgment of that head appears in it, the initial head
returns `timed-out` with the configuration hint, and a pushed head keeps the classification the
adapter's last review earned, with the head that review covered named in the report, unless its
adapter reference still awaits a review of that head. The response timeout is ten minutes without
adapter-defined activity after acknowledgment. Reset it only for a recognized adapter state
transition tied to the current review round or source head; unrelated comments, stale reactions, and
old approvals do not reset it. A terminal response ends the wait immediately.

CI is observable context, not this skill's repair scope. Report a failed or errored required check
as a blocker. Allow clearly advancing CI to continue; do not claim merge readiness from review state
alone.

### 3. Triage and respond

For each new finding:

1. apply `engineering:receiving-feedback`;
2. classify it using that skill's status taxonomy;
3. implement only accepted work within granted authority;
4. validate the smallest coherent fix;
5. respond, react, and resolve the thread according to the active adapter within granted authority,
   after the round's push when accepted work changes the branch and at once when it does not;
6. preserve rejected or deferred reasoning in the change request within granted authority.

When accepted work changes the branch, apply `git:commit` to the completed round, then apply
`git:tidy-history`, which publishes the branch it rewrites; push normally when it rewrote nothing.
Record the new SHA. The repository's review configuration decides whether the new head gets another
review, and each adapter's follow-up protocol observes that decision: when the configuration reviews
the new head, every earlier signal from that adapter is stale and its round continues on the new
head; when it does not, the classification the adapter's last review earned carries forward and the
report names the head that review covered.

Apply `writing:technical-writing` to each reply and each disposition comment when that skill is
available; it owns the wording, as a collaborative comment. Three things stay with this workflow:
Authority and boundaries decides whether a reply is published and its thread resolved, the active
adapter owns reactions, mentions, and the forge calls, and a reply identifies an accepted fix by the
file and the behavior or rule it changes, not by a commit SHA, because this round's tidy, or a later
round's, replaces the commits.

Keep a poll log or another file this workflow writes in a directory named for the topic branch under
the scratch location the repository's instructions name, or in the system temporary directory
without one, and list in the report each such file that outlives the invocation.

Never filter new feedback by commit association alone when the forge can re-anchor old threads.
Track stable thread or comment IDs and compare them with the snapshot.

### 4. Stop rounds

A review round covers every active adapter that has not converged, reviewing the same source head
through their terminal response. A current-head review already observed when the invocation starts
counts as round one. Allow at most seven review rounds total per invocation unless the user
explicitly changes the limit. Disposition every finding received in round seven and commit and push
permitted fixes, then stop before round eight. Return `round-limit` for each adapter that round
seven leaves neither `approved` nor converged, whether or not the disposition produced a new head.

An adapter's terminal clean signal on the current head classifies it `approved`. Otherwise the
convergence rule applies: an adapter that returned findings in the round has converged when every
one of them sits below the top consequence tier.

- An accepted or auto-accepted finding carries the rating `engineering:receiving-feedback` assigns.
- A finding dispositioned deferred or rejected sits below the top tier.
- A gated or needs-clarification finding blocks convergence and stops rounds as a required user
  decision.

After dispositioning a converged adapter's findings and pushing its permitted fixes:

1. Stop its rounds, and continue rounds for adapters that have not converged.
2. Classify it by the signal its last review earned under its adapter reference,
   `resolved-with-exceptions` when that review gave no clean signal.
3. Report the current source head, the earlier head its last review covered, and every disposition
   applied since that review, with the evidence for each rejection or deferral.
4. Before the hand off, apply that adapter's follow-up protocol to the current head and report the
   observation with its status.

A review of a later head can appear from an adapter that converged or whose classification carried
forward, at that final observation or while the loop still polls another adapter. Disposition its
findings, then:

- when that review itself fails the convergence rule, the adapter is active again and its rounds
  continue;
- otherwise, fix a finding from that review only when it concerns behavior the change request
  already claims, such as a regression in an input it supports or a flaw in an earlier round's fix,
  and defer the rest, drafting one follow-up issue for them in the hand-off report;
- after one push of such fixes past convergence, defer every below-top-tier finding from that
  adapter's later reviews and hand off.

When a finding revises a condition that two earlier rounds already revised, treat the condition as
settled: reject the finding by reference to the earlier revisions unless it shows an input the
current condition handles wrongly; when fixing that input would undo an earlier revision, the
finding is a required user decision.

Stop before the round limit when:

- a required user decision remains;
- the same rejected finding returns without new evidence;
- an adapter or forge changes behavior beyond its reference;
- CI or permissions block progress;
- the response timeout expires.

The user may rerun this skill later; reconstruct state from the forge rather than relying on
session-only counters or assumptions.

## Completion and hand off

Report the current source head and target branch, active adapters, rounds completed, feedback
dispositions, thread resolution, required CI state, and one terminal status per adapter. When more
than three rounds completed, add the round trend: findings per round, findings whose mechanism
repeated an earlier round, and each round's fix size in changed lines, so the user can judge whether
a further invocation would pay.

When every active adapter is `approved`, stop and recommend `git:merge-pr` next; continue into it
only when the user's request asked to merge the change request.

For `resolved-with-exceptions`, include every exception and the missing green signal in the same
hand off. When every exception is a rejection recorded in the change request or an accepted fix on a
head the repository's review configuration does not review, every thread is resolved, and required
CI passes, recommend `git:merge-pr` with those exceptions, naming each such fix as unconfirmed by
its adapter; otherwise the user decides whether to rerun this skill or continue with `git:merge-pr`.
For `round-limit`, `timed-out`, or `blocked`, do not suggest that the review gate passed.
