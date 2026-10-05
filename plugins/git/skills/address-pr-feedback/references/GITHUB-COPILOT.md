# GitHub Copilot review adapter

Use this adapter for GitHub Copilot code review on GitHub. Its external protocol may change; when
live behavior contradicts this reference, stop and report the observed difference instead of
guessing.

## Identity and selection

Recognize review activity from the GitHub Copilot pull-request reviewer app. Its login differs by
surface: `copilot-pull-request-reviewer[bot]` on REST reviews, `Copilot` on REST review comments and
as the `requested_reviewer` of a timeline `review_requested` event, and
`copilot-pull-request-reviewer` as a GraphQL comment author. Select this adapter when the user names
Copilot, the current pull request contains its activity, or prior pull requests provide reliable
repository evidence.

## Polling script

Run [`scripts/poll-copilot.sh`](../scripts/poll-copilot.sh) on the initial head and after every
push: `<skill-dir>/scripts/poll-copilot.sh <pr> [interval-seconds] [max-polls]`, unsandboxed and in
the foreground, because a background completion does not wake every agent. Set `REPO` to the
forge-side base repository when the checkout is a fork. Observed activity decides first: a Copilot
review request created after the head was published, or a Copilot review of the head, starts the
wait. Only without either does the script read the repository rules that apply to the base branch,
to learn whether the configuration reviews the head. The script prints the review body and every
unresolved Copilot thread with its id and comments; when it prints a `truncated:` line for a thread,
fetch that thread's remaining comments before triage. Triage the threads as Findings and approval
directs. Read the outcome from its `exit=` line:

- `0`: Copilot completed a review of the head, and no Copilot thread is unresolved.
- `1`: Copilot completed a review of the head; the dump holds its unresolved threads.
- `2`: Copilot stated that it could not review the head; classify the adapter `blocked` with the
  stated cause, as Findings and approval directs.
- `3`: the head changed during the poll; rerun on the new head.
- `4`: the configuration reviews the head, or the script could not rule that out, but no
  acknowledgment came within the acknowledgment window. For the initial head, return `timed-out` and
  report that the automatic-review configuration may need checking; for a pushed head, apply
  Follow-up review.
- `5`: the poll budget ended after acknowledgment without a review; return `timed-out`.
- `6`: observation failure; retry once, then return `blocked`.
- `7`: the configuration does not review this pull request, Copilot never reviewed it, and no
  Copilot activity appeared within the acknowledgment window: no Copilot rule covers the base, no
  rule reviews drafts, or the pull request was retargeted onto the base and has since neither left
  draft nor received a push under `review_on_push: true`. Copilot is not active for this pull
  request: report it as not configured, with the reason the script prints, instead of classifying
  it.
- `8`: the configuration does not review this head, such as a push under `review_on_push: false`,
  and no Copilot activity appeared within the acknowledgment window; apply Follow-up review with the
  last reviewed head the script prints.

Repository rules are not the only source of Copilot reviews: an organization or user setting, or a
manual request, can start one that the rules do not show. Before exit `7` or `8`, the script waits
until the acknowledgment window after the head reached the branch has passed. A review request or
review that appears on a head later is adapter activity, so the final observation before the hand
off still starts a round.

## Initial review

Treat a Copilot `review_requested` event in the pull request timeline as acknowledgment and adapter
activity. The event remains observable after GitHub consumes the request and removes Copilot from
`requested_reviewers`.

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

Copilot's review body may list each finding in an overview with a severity badge, such as
`High severity`; the inline comment carries none. The badge is the reviewer's claim about
consequence, and the shared feedback discipline rates that claim.

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
the configuration reviews the new head. When it does not, report each such fix as unconfirmed,
because the configuration never reviews the head that carries it. Whether Copilot may approve, and
whether a Copilot approval is required for merge, are repository settings that `git:merge-pr` checks
against the merge state.

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

The repository's configuration decides whether a push starts another Copilot review, and this
adapter never requests one. After a push, run the polling script on the new head. On exit `8` or
`4`, the adapter keeps the classification its last review earned and the report names the head that
review covered. When a review request or a review of the new head appears, tie a new round to the
new `headRefOid` and require a current-head terminal response within the response timeout.
