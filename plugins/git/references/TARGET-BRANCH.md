# Target branch resolution

Shared policy for `commit`, `create-pr`, and `tidy-history`. The target is the branch a topic branch
merges into. Resolve it in this order:

1. the target the user names, or the target an applying skill passes on;
2. the target of an open change request for the topic branch;
3. repository or branch-specific merge-base configuration, such as the
   `branch.<topic>.gh-merge-base` setting that `gh pr create` reads;
4. the remote's default branch, read from `git ls-remote --symref <remote> HEAD`, because
   `git fetch` leaves a stale local `refs/remotes/<remote>/HEAD` in place.

Fetch the remote that hosts the target before comparing the topic branch with the target: a stale
remote-tracking ref misplaces the merge base and reports a commit the target already contains as
missing from it.
