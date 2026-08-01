# GitHub Pull Requests

Use this reference only after selecting a GitHub remote.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation.

## Inspect

- Follow loaded account-routing guidance before identity-sensitive or mutating `gh` operations.
- Resolve repository defaults and enabled merge methods with `gh repo view`.
- Resolve an existing pull request by branch before creating one. Use `gh pr view --json` fields
  including `url`, `state`, `isDraft`, `headRefName`, `headRefOid`, `baseRefName`, `mergeable`,
  `mergeStateStatus`, and `statusCheckRollup`.
- Treat the exact `headRefOid` as the published source-head identity.

## Create Or Refresh

Push the branch explicitly before running `gh pr create`; do not depend on interactive push or fork
prompts.

`--fill` derives the body from commits and bypasses repository templates. When a pull request
template exists, the template wins: take the title from the commits or an explicit `--title`, and
supply the template as the body, for example with `--body-file <template-path>`. Without a template,
prefer:

```text
gh pr create --base <target> --head <topic> --fill
```

Provide explicit title or body values only when needed to satisfy repository rules or preserve
user-supplied content. Add `--draft` only when requested.

If `gh pr view <topic>` finds an open pull request, compare `baseRefName` with the resolved target.
When the core workflow authorizes retargeting, use `gh pr edit <pr> --base <target>`, then refetch
and reassess the pull request. Reuse its URL only after the targets match; never create another.

## Initial CI

Inspect required checks with:

```text
gh pr checks <pr> --required --json bucket,completedAt,description,link,name,startedAt,state,workflow
```

Poll only as needed to enforce the core workflow's inactivity rule. `bucket=fail` or `bucket=cancel`
is terminal; `bucket=pending` needs progress evidence before extending the wait.

## GitHub Merge Semantics

GitHub pull requests do not expose a true fast-forward merge. GitHub rebase merging always creates
new commit SHAs and updates committer information, even when the topic already contains the current
base. Use merge commit when exact topic commit identity must survive.
