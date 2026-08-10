# Meta

This plugin maintains the marketplace itself. Its skills operate on the marketplace's own skills and
repository rather than on a user's project.

## Skills

- `submit-skill-feedback`: Manual-only. Run it after a marketplace skill to capture the session's
  feedback on how that skill performed during the actual run, and file each item as a GitHub issue
  in the marketplace repository, labeled `feedback` plus `plugin:<plugin-name>`.

## Feedback labels

The marketplace repository maintains the label taxonomy by hand: one `feedback` label plus one
`plugin:<plugin-name>` label per plugin. `submit-skill-feedback` applies labels but never creates
them.
