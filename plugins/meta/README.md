# Meta

This plugin maintains the marketplace itself. Its skills operate on the marketplace's own skills and
repository rather than on a user's project.

## Skills

- `submit-skill-feedback`: Manual-only. Run it after a marketplace skill to qualify feedback from
  the actual run. The skill files public-source feedback as GitHub issues or recurrence comments and
  preserves private-source feedback as ignored local records.

## Feedback labels

The marketplace repository maintains the label taxonomy by hand: one `feedback` label plus one
`plugin:<plugin-name>` label per plugin. For public submissions, `submit-skill-feedback` applies
labels but never creates them.
