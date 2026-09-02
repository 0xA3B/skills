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
review appears before the inactivity timeout, return `timed-out` and report that the repository or
automatic-review configuration may need checking.

## Findings and approval

Inspect:

```text
gh api repos/{owner}/{repo}/pulls/<pr>/reviews
gh api repos/{owner}/{repo}/pulls/<pr>/comments
gh api repos/{owner}/{repo}/issues/<pr>/comments
gh api repos/{owner}/{repo}/issues/<pr>/reactions
gh pr view <pr> --json headRefOid,mergeStateStatus,statusCheckRollup
```

`gh` resolves `{owner}` and `{repo}` from the current repository; substitute the pull request number
for `<pr>` yourself.

Findings appear as a Codex review plus inline review comments. Track inline comment IDs and review
thread IDs. GitHub may re-anchor unresolved comments to a newer commit, so `commit_id` is not a
stable indication that a finding is new.

If the connector returns an explicit transient error and requests another `@codex review`, treat the
error as adapter activity and retry once for that head. Return `blocked` when the retry returns the
same error; do not count a known error response as inactivity.

The connector's 👍 reaction on the pull request issue is the terminal clean signal. A clean round
may be reaction-only: 👍 with zero reviews, zero inline comments, zero issue comments, and zero
unresolved threads is approval, not a deviation. When a clean comment is also present, require its
reviewed commit to match `headRefOid`, and treat the comment as corroborating evidence rather than a
requirement.

Bind the 👍 to a head before trusting it. When the current head is the only head the pull request
has ever had, the 👍 binds to that head. After any push, a pre-existing 👍 is stale; request a new
round and require a new terminal signal for the new head.

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

When a finding exists only in a review body and has no inline comment or thread, record its
disposition in a pull-request comment that names the finding. Skip reaction and thread-resolution
steps that have no target.

Do not use `@codex address that feedback`; the agent driving this workflow owns fixes, validation,
commits, and push authority.

## Follow-up review

A push does not reliably request another Codex review. After a permitted fix round is committed and
pushed, comment:

```text
@codex review
```

This follow-up request is authorized for the active adapter. Begin a new round tied to the new
`headRefOid`, watch for acknowledgment, and require a new current-head terminal response.
