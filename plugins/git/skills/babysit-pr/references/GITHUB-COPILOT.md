# GitHub Copilot review adapter

Contents: Identity and selection, Polling script, Initial review, Findings and approval, Responses
and thread resolution, Follow-up review.

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
push: `<skill-dir>/scripts/poll-copilot.sh <pr> [interval-seconds] [max-polls]`, run as
`2. Poll active adapters` directs. Set `REPO` to the forge-side base repository when the checkout is
a fork. The script prints the review body and every unresolved Copilot thread with its id and
comments; when it prints a `truncated:` line for a thread, fetch that thread's remaining comments
before triage. Triage the threads as Findings and approval directs. Read the outcome from its
`exit=` line as `2. Poll active adapters` lists them, with these refinements and additions:

- `2`: Copilot stated that it could not review the head; classify the adapter `blocked` with the
  stated cause, as Findings and approval directs.
- `4`: the configuration reviews the head, or the script could not rule that out. For a pushed head,
  apply Follow-up review.
- `7`: the configuration does not review this pull request, Copilot never reviewed it, and no
  Copilot activity appeared within the acknowledgment window: no Copilot rule covers the base, no
  rule reviews drafts, or the pull request was retargeted onto the base and has since neither left
  draft nor received a push under `review_on_push: true`. Copilot is not active for this pull
  request: report it as not configured, with the reason the script prints, instead of classifying
  it.
- `8`: the configuration does not review this head, such as a push under `review_on_push: false`,
  and no Copilot activity appeared within the acknowledgment window; apply Follow-up review with the
  last reviewed head the script prints.

An organization or user setting, or a manual request, can start a review the repository rules do not
show, so a Copilot review request or review that appears on a head after exit `7` or `8` is adapter
activity, and the final observation before the hand off still starts a round.

## Initial review

Treat a Copilot `review_requested` event in the pull request timeline as acknowledgment and adapter
activity. The event remains observable after GitHub consumes the request and removes Copilot from
`requested_reviewers`.

## Findings and approval

Copilot submits a pull-request review tied to a commit. Findings appear in the review body and
inline review comments. Copilot's review body may list each finding in an overview with a severity
badge, such as `High severity`; the inline comment carries none. The badge is the reviewer's claim
about consequence, and the shared feedback discipline rates that claim.

Inspect review-body details such as `Suppressed comments`. Copilot may place previously missed
findings there while reporting zero new inline comments. Give an item labeled `Previously missed`
extra scrutiny: recheck the base-to-head diff and prior dispositions for the same mechanism, and
accept it only when the current diff still supports the finding and the reviewer provides new
evidence for any repeated claim. The label alone neither validates nor invalidates the finding.
Treat each suppressed item as a body-only finding and record its disposition in a pull-request
comment.

A current-head review whose body opens by stating that Copilot could not review, such as a quota,
billing, or size limit or an error, is adapter activity but not a completed response: classify the
adapter `blocked` with the stated cause, and let the user decide whether to re-request or proceed on
the other adapters. A review whose body opens with a note that Copilot could not use the selected
tier or its full suite, followed by the review overview, is a completed response.

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

Record each disposition as `3. Triage and respond` directs.

Replies preserve the disposition for human readers; Copilot code review does not consume or answer
thread replies. A repeated finding in a later review is new adapter activity, but a rejected finding
that returns without new evidence still stops the loop under `4. Stop rounds`.

## Follow-up review

The repository's configuration decides whether a push starts another Copilot review, and this
adapter never requests one. After a push, run the polling script on the new head. On exit `8`, the
adapter keeps the classification its last review earned and the report names the head that review
covered. On exit `4`, rerun the script on the same `EXPECT_HEAD`, with `ACK_POLLS` set to the
response timeout in poll intervals, `10` at the default interval: Copilot reviews heads in order,
and a head pushed while it reviewed an earlier one drew its review seven minutes after the push. On
a second exit `4`, return `blocked` as timed out, which replaces that classification, because the
configuration was due to review the pushed head. When a review request or a review of the new head
appears, tie a new round to the new `headRefOid` and require a current-head terminal response within
the response timeout.
