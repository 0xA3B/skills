# create-pr applies review-changes before publishing

`engineering:review-changes` used to fire only on "changes made in the current session", and
`git:create-pr` never performed a review. In real sessions, a session that inherited its changes
through compaction or a handoff matched the trigger poorly, and a review ran before publishing only
when the user asked for one by name. `review-changes` now covers the unpublished changes in the
checkout, and `git:create-pr` applies it before it commits and pushes, so a change published through
`git:create-pr` is reviewed before a teammate or a review bot sees it.

## Considered options

- **Have `review-changes` fire on its own before every push.** A skill description fires less
  reliably than a workflow step, and this one would also fire on each fix that `git:babysit-pr`
  pushes to a change request that is already under review.
- **Keep session ownership as the trigger.** Ownership decides who can triage a finding, not whether
  the changes need a review. `review-changes` keeps it as authoring context: a session without the
  decisions behind the changes reports the findings and leaves the fixes to the user.

## Consequences

`git:create-pr` skips the review when a review in the session already covered the changes, or when
the user says to skip it. It also skips the review when the session does not hold authoring context,
because that session could only report findings, and a request to publish does not ask for a report.
A push outside `git:create-pr` gets a review only when the user asks for one. The `git` plugin now
names a skill of the `engineering` plugin and publishes without a review when that plugin is not
installed.
