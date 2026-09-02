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
gh api repos/{owner}/{repo}/pulls/<pr>/reviews
gh api repos/{owner}/{repo}/pulls/<pr>/comments
gh api repos/{owner}/{repo}/pulls/<pr>/requested_reviewers
gh api repos/{owner}/{repo}/issues/<pr>/timeline
gh pr view <pr-url> --json headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup
```

Use the pull request's resolved base owner and repository for `{owner}` and `{repo}`. Substitute the
pull request number for `<pr>` and its full URL for `<pr-url>`.

Copilot submits a pull-request review tied to a commit. Findings appear in the review body and
inline review comments. Track inline comment IDs and review thread IDs. GitHub may re-anchor
unresolved comments to a newer commit, so `commit_id` is not a stable indication that a finding is
new.

Inspect review-body details such as `Suppressed comments`. Copilot may place previously missed
findings there while reporting zero new inline comments. Treat each suppressed item as a body-only
finding and record its disposition in a pull-request comment.

Treat a current-head `COMMENTED` review as a completed response, not approval. When it has findings,
triage its review body and inline comments. When it has no findings, classify the adapter as
`resolved-with-exceptions` because the explicit approval signal is absent.

Some GitHub configurations permit Copilot to submit an `APPROVED` review. Treat `APPROVED` as the
terminal clean signal only when its `commit_id` matches `headRefOid` and no unresolved Copilot
threads remain. Whether that approval satisfies a branch or ruleset requirement is repository
policy; verify the pull request's merge state instead of encoding that policy in this adapter.

## Responses and thread resolution

Query review threads through `gh api graphql` and act through its mutations —
`addPullRequestReviewThreadReply` to reply and `resolveReviewThread` to resolve, both fed by the
thread `id` from that query. `gh` has no native subcommand for either action.

Apply the shared feedback discipline before acting. After disposition:

- react 👍 to an accepted finding and 👎 to a rejected finding when the inline comment offers that
  feedback channel;
- reply with the accepted fix and validation, or the technical evidence for rejection;
- resolve the GitHub review thread only after the disposition is recorded;
- verify the thread no longer appears in the pull request's unresolved review threads.

Replies preserve the disposition for human readers; Copilot code review does not consume or answer
thread replies. A repeated finding in a later review is new adapter activity, but the shared
non-convergence rule still applies when it contains no new evidence.

When a finding exists only in a review body and has no inline comment or thread, record its
disposition in a pull-request comment that names the finding. Skip reaction and thread-resolution
steps that have no target.

## Follow-up review

A push triggers another Copilot review only when the active automatic-review configuration includes
new pushes. After a permitted fix round is committed and pushed, inspect review requests and
timeline events created after the push. If neither shows a new review in progress, request Copilot
through the GitHub reviewer API:

```text
gh api --method POST repos/{owner}/{repo}/pulls/<pr>/requested_reviewers \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

This follow-up request is authorized for the active adapter. Begin a new round tied to the new
`headRefOid` and require a current-head terminal response.
