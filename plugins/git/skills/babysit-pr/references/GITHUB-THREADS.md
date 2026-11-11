# GitHub review threads

Use this reference for every GitHub adapter. It owns how to reply to, react to, and resolve a review
bot's threads; each adapter reference adds its bot's rules.

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
