# Git Workflows

![Git Workflows plugin logo](assets/logo.png)

These skills create Conventional Commits and drive GitHub or GitLab change requests from operational
preparation through automated review and verified merge cleanup.

`address-pr-feedback` requires the `engineering-workflows` plugin so it can apply
`engineering-workflows:receiving-feedback`.

An agent can invoke `commit` implicitly. The three change-request skills are manual-only; each stops
at an explicit hand off instead of a chain into the next workflow.

Conflict resolution is intentionally outside these lifecycle skills; `create-pr` and `merge-pr` stop
and report when a merge or a rebase would require it.

## Skills

- `commit`: Inspect, partition, stage, and commit current changes with Conventional Commit messages.
  Detailed specification notes live in `skills/commit/references/`.
- `create-pr`: Prepare a branch operationally, create or refresh its pull request or merge request,
  and observe initial CI.
- `address-pr-feedback`: Drive active automated-review adapters to current-head approval or a
  clearly reported exception.
- `merge-pr`: Enforce forge-native merge gates, select a merge method, verify the remote merge, and
  clean up local and remote branch state.
