# GitHub Codex review adapter

Contents: Identity and selection, Initial review, Polling script, Findings and approval, Responses
and thread resolution, Follow-up review.

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
review appears within the acknowledgment window, return `blocked` as timed out and report that the
repository or automatic-review configuration may need checking.

The connector may maintain an issue comment marked `<!-- codex-pull-request-review-summary -->`.
Treat a transition in its status, commit, or review trigger as adapter activity. `Running` is
acknowledgment for the named commit. `Completed` means the review finished; it is not approval
without the adapter's clean signal.

## Polling script

Run [`scripts/poll-codex.sh`](../scripts/poll-codex.sh) to wait for the terminal signal:
`<skill-dir>/scripts/poll-codex.sh <pr> [interval-seconds] [max-polls]`, run as
`2. Poll active adapters` directs. After exit `0` or `1`, fetch the head's Codex review body as
Findings and approval directs, because the dump lists only review threads. The script prints one
line per poll and, on a terminal signal, every unresolved thread Codex opened, with its thread id,
comment ids, and full bodies, then the head, merge state, checks, and the count of unresolved
threads from every reviewer. Its defaults are the login and summary marker named above; set `BOT` or
`MARK` when the connector renames either, and `REPO` to the forge-side base repository when the
checkout is a fork. Read the outcome from its `exit=` line as `2. Poll active adapters` lists them,
with these refinements:

- `0` also covers a reaction-only clean round: a 👍 after the head was published, with no summary
  row. A last printed `thumbs` count of one or more is the clean signal; zero after the extra polls
  is a completed review without it, classified by the round's dispositions.
- `2`: the connector reported an error; apply the transient-error rule below.
- `4` on a pushed head: apply Follow-up review.

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

Findings appear as a Codex review plus inline review comments. Each inline finding carries a
severity badge from P1 to P3. P1 claims the top consequence tier and P2 and P3 claim below it; the
shared feedback discipline rates that claim. A finding that appears only in a review body carries no
badge.

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

Record each disposition as `3. Triage and respond` directs.

In a pull request description, reply, or comment, write the `@codex` mention only in a review
request this adapter allows or the user asks to have posted, and otherwise name Codex without the
`@`: Codex treats any mention as a task or review invocation, so a description that quoted a past
review request started a coding task instead of a review. The agent driving this workflow owns
fixes, validation, commits, and push authority, so no mention asks Codex to address feedback.

## Follow-up review

The connector's automatic-review configuration decides whether a push starts another Codex review,
and this adapter requests none beyond the single retry the transient-error rule allows and the
late-review request below.

After a push, watch the new head with the polling script. A hand-assembled query misses the 👀
reaction and the `Running` row the connector edits into the summary comment in place. Any exit other
than `4` continues the round on the new `headRefOid` under the exit meanings in Polling script, and
the round requires a current-head terminal response within the response timeout; a review of a head
pushed after the adapter left the loop under `4. Stop rounds` is the later-head review that section
describes.

When the pushed head exits `4` and the summary row's trigger reads `New commits`, which means the
repository reviews every push, the review is late, not absent: Codex has posted a pushed head's
review about seven minutes after the push. Keep the earlier head's approval off the pushed head,
post `@codex review` once as the late-review request, and run the polling script on that head again.
A second exit `4` returns `blocked` as timed out, which replaces the classification the adapter's
last review earned, including after it left the loop. When no summary row reads `New commits`, exit
`4` applies the pushed-head outcome from `2. Poll active adapters`, or the initial-head outcome when
no earlier Codex review covers any head of the pull request.
