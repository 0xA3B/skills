# GitLab Merge Request Merge

Use this reference only after selecting a GitLab merge request.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation.

## Inspect Native Gates

- Follow loaded authentication and environment guidance before mutating `glab` operations.
- Inspect `glab mr view <mr> --output json` and use `glab api` for fields the CLI omits, including
  source SHA, target branch, draft state, detailed merge status, blocking discussions, pipeline,
  approvals, merge trains, and project merge policy.
- Use `glab mr view <mr> --unresolved` or the discussions API and require zero unresolved
  discussions regardless of author.
- Require the source head's pipeline and all project-required approvals to pass.

## Merge

Select project fast-forward, rebase, merge commit, or squash behavior under the core policy. Guard
the operation with the source SHA:

```text
glab mr merge <mr> --sha <head-sha> --auto-merge=false --yes <method-flag>
```

Omit a method flag when project policy already owns the merge method. Do not request source-branch
deletion in the merge command; verify the result first.

When project policy requires a merge train or equivalent queue, enqueue only after the current
pipeline and approvals pass. Poll merge-request and train state until it is actually merged or the
core queue timeout expires.

## Verify And Delete

Refetch the target, project, and merge-request metadata. Verify `state=merged`, the recorded source
SHA, the resulting target commit, and the selected merge method.

True fast-forward and merge commit preserve topic commit identities. Server-side rebase and squash
rewrite them; GitLab server-side rebase also removes GPG signatures. Verify the merged result under
the actual method before updating ignored SHA references.

After verification, check whether the remote source branch remains. Delete it only when permissions
and project policy allow, then fetch with prune before local cleanup.
