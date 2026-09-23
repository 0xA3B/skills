# GitHub Copilot review adapter

Use this adapter for GitHub Copilot code review on GitHub. Its external protocol may change; when
live behavior contradicts this reference, stop and report the observed difference instead of
guessing.

## Identity and selection

Recognize review activity from the GitHub Copilot pull-request reviewer app, surfaced through the
API as `copilot-pull-request-reviewer[bot]`. Select this adapter when the user names Copilot, the
current pull request contains its activity, or prior pull requests provide reliable repository
evidence.

## Initial review

GitHub may request an initial review automatically when repository, organization, or user settings
enable it. The configured rule may review only the initial ready pull request, every new push, or
draft pull requests too. Observe the pull request instead of inferring which configuration applies.

Treat a Copilot `review_requested` event in the pull request timeline as acknowledgment and adapter
activity. The event remains observable after GitHub consumes the request and removes Copilot from
`requested_reviewers`.

If no current-head review appears before the inactivity timeout, return `timed-out` and report that
the automatic-review or review-request configuration may need checking.

## Findings and approval

Inspect:

```text
gh api --paginate repos/{owner}/{repo}/pulls/<pr>/reviews
gh api --paginate repos/{owner}/{repo}/pulls/<pr>/comments
gh api --paginate repos/{owner}/{repo}/pulls/<pr>/requested_reviewers
gh api --paginate repos/{owner}/{repo}/issues/<pr>/timeline
gh pr view <pr-url> --json headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup
```

Use the pull request's resolved base owner and repository for `{owner}` and `{repo}`. Substitute the
pull request number for `<pr>` and its full URL for `<pr-url>`.

Copilot submits a pull-request review tied to a commit. Findings appear in the review body and
inline review comments. Track inline comment IDs and review thread IDs. GitHub may re-anchor
unresolved comments to a newer commit, so `commit_id` is not a stable indication that a finding is
new.

Copilot findings carry no severity badge, so the rating the shared feedback discipline assigns
stands on its own.

Inspect review-body details such as `Suppressed comments`. Copilot may place previously missed
findings there while reporting zero new inline comments. Give an item labeled `Previously missed`
extra scrutiny: recheck the base-to-head diff and prior dispositions for the same mechanism, and
accept it only when the current diff still supports the finding and the reviewer provides new
evidence for any repeated claim. The label alone neither validates nor invalidates the finding.
Treat each suppressed item as a body-only finding and record its disposition in a pull-request
comment.

A current-head review whose body states that Copilot could not review, such as a quota limit or an
error, is adapter activity but not a completed response: classify the adapter `blocked` with the
stated cause, and let the user decide whether to re-request or proceed on the other adapters.

Treat any other current-head `COMMENTED` review as a completed response and triage its review body
and inline comments. This adapter's terminal clean signal, with no unresolved Copilot threads in
either form, is an `APPROVED` review whose `commit_id` matches `headRefOid`, or a completed review
with no findings or with findings that all sit below the top consequence tier, every one
dispositioned and none gated or needing clarification. A completed review with a top-tier finding
earns no clean signal: once its fixes are pushed, the adapter is `resolved-with-exceptions` unless
the configuration reviews the new head. Whether Copilot may approve, and whether a Copilot approval
is required for merge, are repository settings that `git:merge-pr` checks against the merge state.

## Responses and thread resolution

Query the complete review-thread connection through `gh api graphql` and act through its mutations —
`addPullRequestReviewThreadReply` to reply and `resolveReviewThread` to resolve, both fed by the
thread `id` from that query. `gh` has no native subcommand for either action.

Apply the shared feedback discipline before acting. After disposition:

- react 👍 to an accepted finding and 👎 to a rejected finding when the inline comment offers that
  feedback channel;
- reply with the accepted fix and validation, or the technical evidence for rejection;
- resolve the GitHub review thread only after the disposition is recorded;
- verify the thread no longer appears in the pull request's unresolved review threads.

Replies preserve the disposition for human readers; Copilot code review does not consume or answer
thread replies. A repeated finding in a later review is new adapter activity, but a rejected finding
that returns without new evidence still stops the loop under `4. Stop rounds`.

When a finding exists only in a review body and has no inline comment or thread, record its
disposition in a pull-request comment that names the finding. Skip reaction and thread-resolution
steps that have no target.

## Follow-up review

The repository's ruleset decides whether a push starts another Copilot review, and this adapter
never requests one. After a push, watch for a `review_requested` event created after the push or a
review of the new head, through the inactivity timeout, or through two polls when an earlier push on
this pull request drew neither. When neither appears, the adapter keeps the classification its last
review earned and the report names the head that review covered. When either appears, tie a new
round to the new `headRefOid` and require a current-head terminal response under the inactivity
timeout.
