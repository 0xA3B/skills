# GitHub Codex review adapter

Use this adapter for Codex code review on GitHub. Its external protocol may change; when live
behavior contradicts this reference, stop and report the observed difference instead of guessing.

## Identity and selection

Recognize review activity from the ChatGPT Codex Connector GitHub app, commonly surfaced as
`chatgpt-codex-connector[bot]`. Select this adapter when the user names it, the current pull request
contains its activity, or prior pull requests provide reliable repository evidence.

## Initial review

Opening a ready pull request may automatically start review when automatic reviews are configured.
The adapter does not initiate the first review merely because this skill was invoked.

Treat a Codex 👀 reaction associated with the pull request or its trigger as acknowledgment and
activity, not approval. The reaction may be transient. If neither acknowledgment nor a current-head
review appears within the acknowledgment window, return `timed-out` and report that the repository
or automatic-review configuration may need checking.

The connector may maintain an issue comment marked `<!-- codex-pull-request-review-summary -->`.
Treat a transition in its status, commit, or review trigger as adapter activity. `Running` is
acknowledgment for the named commit. `Completed` means the review finished; it is not approval
without the adapter's clean signal.

## Polling script

Run [`scripts/poll-codex.sh`](../scripts/poll-codex.sh) to wait for the terminal signal:
`<skill-dir>/scripts/poll-codex.sh <pr> [interval-seconds] [max-polls]`, unsandboxed and in the
foreground, because a background completion does not wake every agent. After exit `0` or `1`, fetch
the head's Codex review body as Findings and approval directs, because the dump lists only review
threads. The script prints one line per poll and, on a terminal signal, every unresolved review
thread with its thread id, comment ids, and full bodies, then the head, merge state, and checks. Its
defaults are the login and summary marker named above; set `BOT` or `MARK` when the connector
renames either, and `REPO` to the forge-side base repository when the checkout is a fork. Read the
outcome from its `exit=` line:

- `0`: the review of the head completed with no unresolved threads. A last printed `thumbs` count of
  one or more is the clean signal; zero after the extra polls is a completed review without it,
  classified by the round's dispositions.
- `1`: the review completed with unresolved threads; the dump holds the round's findings.
- `2`: the connector reported an error; apply the transient-error rule below.
- `3`: the head changed during the poll; rerun on the new head.
- `4`: no acknowledgment within the acknowledgment window; apply the initial-head or pushed-head
  outcome from `2. Poll active adapters`.
- `5`: the poll budget ended without a terminal signal. The default budget is ten minutes, the
  response timeout; return `timed-out` when the adapter showed no activity across it, and rerun the
  script when it did.
- `6`: observation failure; retry once, then return `blocked`.

## Findings and approval

Inspect:

```text
gh api --paginate repos/{owner}/{repo}/pulls/<pr>/reviews
gh api --paginate repos/{owner}/{repo}/pulls/<pr>/comments
gh api --paginate repos/{owner}/{repo}/issues/<pr>/comments
gh api --paginate repos/{owner}/{repo}/issues/<pr>/reactions
gh pr view <pr-url> --json headRefOid,mergeStateStatus,statusCheckRollup
```

Use the pull request's resolved base owner and repository for `{owner}` and `{repo}`. Substitute the
pull request number for `<pr>` and its full URL for `<pr-url>`.

Findings appear as a Codex review plus inline review comments. Track inline comment IDs and review
thread IDs. GitHub may re-anchor unresolved comments to a newer commit, so `commit_id` is not a
stable indication that a finding is new.

Each inline finding carries a severity badge from P1 to P3. P1 claims the top consequence tier and
P2 and P3 claim below it; the shared feedback discipline rates that claim. A finding that appears
only in a review body carries no badge.

If the connector returns an explicit transient error and requests another `@codex review`, treat the
error as adapter activity and retry once for that head. Return `blocked` when the retry returns the
same error; do not count a known error response as inactivity.

The connector's 👍 reaction on the pull request issue is the terminal clean signal. A clean round
may be reaction-only: 👍 with zero reviews, zero inline comments, zero issue comments, and zero
unresolved threads is approval, not a deviation. When a clean comment is also present, require its
reviewed commit to match `headRefOid`, and treat the comment as corroborating evidence rather than a
requirement.

Bind the 👍 to a head before trusting it. When the current head is the only head the pull request
has ever had, the 👍 binds to that head. After a push, a pre-existing 👍 covers the earlier head;
Follow-up review decides whether the new head needs its own signal.

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

When a finding exists only in a review body and has no inline comment or thread, record its
disposition in a pull-request comment that names the finding. Skip reaction and thread-resolution
steps that have no target.

Do not use `@codex address that feedback`; the agent driving this workflow owns fixes, validation,
commits, and push authority.

## Follow-up review

The connector's automatic-review configuration decides whether a push starts another Codex review,
and this adapter requests none beyond the single retry the transient-error rule allows. After a
push, watch the acknowledgment window for a 👀 reaction or a summary-comment transition naming the
new commit. When none appears, the adapter keeps the classification its last review earned and the
report names the head that review covered. When acknowledgment appears, tie a new round to the new
`headRefOid` and require a current-head terminal response within the response timeout; a review of a
head pushed after the adapter converged under `4. Stop rounds` is the later-head review the
convergence rule describes.
