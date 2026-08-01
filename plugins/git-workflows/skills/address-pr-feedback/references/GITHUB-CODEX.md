# GitHub Codex Review Adapter

Use this adapter for Codex code review on GitHub. Its external protocol may change; when live
behavior contradicts this reference, stop and report the observed difference instead of guessing.

## Identity And Selection

Recognize review activity from the ChatGPT Codex Connector GitHub app, commonly surfaced as
`chatgpt-codex-connector[bot]`. Select this adapter when the user names it, the current pull request
contains its activity, or prior pull requests provide reliable repository evidence.

## Initial Review

Opening a ready pull request may automatically start review when automatic reviews are configured.
The adapter does not initiate the first review merely because this skill was invoked.

Treat a Codex 👀 reaction associated with the pull request or its trigger as acknowledgment and
activity, not approval. The reaction may be transient. If neither acknowledgment nor a current-head
review appears before the core inactivity timeout, return `timed-out` and report that the repository
or automatic-review configuration may need checking.

## Findings And Approval

Inspect:

```text
gh api repos/{owner}/{repo}/pulls/{number}/reviews
gh api repos/{owner}/{repo}/pulls/{number}/comments
gh api repos/{owner}/{repo}/issues/{number}/comments
gh api repos/{owner}/{repo}/issues/{number}/reactions
gh pr view {number} --json headRefOid,mergeStateStatus,statusCheckRollup
```

Findings appear as a Codex review plus inline review comments. Track inline comment IDs and review
thread IDs. GitHub may re-anchor unresolved comments to a newer commit, so `commit_id` is not a
stable indication that a finding is new.

Treat approval as current only when the clean comment's reviewed commit matches `headRefOid` and the
pull request carries the connector's 👍 clean signal. The 👍 is on the pull request issue, not
necessarily on the comment that triggered review. Never reuse an approval for an older head.

## Responses And Thread Resolution

Apply the shared feedback discipline before acting. After disposition:

- react 👍 to an accepted finding and 👎 to a rejected finding when the inline comment offers that
  feedback channel;
- reply with the accepted fix and validation, or the technical evidence for rejection;
- resolve the GitHub review thread only after the disposition is recorded;
- verify the thread no longer appears in the pull request's unresolved review threads.

Do not use `@codex address that feedback`; the agent driving this workflow owns fixes, validation,
commits, and push authority.

## Follow-Up Review

A push does not reliably request another Codex review. After a permitted fix round is committed and
pushed, comment:

```text
@codex review
```

This follow-up request is authorized for the active adapter. Begin a new round tied to the new
`headRefOid`, watch for acknowledgment, and require a new current-head terminal response.
