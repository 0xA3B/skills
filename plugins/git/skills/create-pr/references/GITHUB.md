# GitHub pull requests

Use this reference only after selecting a GitHub remote.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation.
`<base-repo>` is the target repository as `OWNER/REPO`; `<topic>` is the topic branch; `<head>` is
`<head-owner>:<topic>` for a fork or `<topic>` when both branches share a repository. After
resolving or creating the pull request, use its canonical `<pr-url>` for every later command.

## Inspect

- Follow loaded account-routing guidance before identity-sensitive or mutating `gh` operations.
- Resolve repository defaults and enabled merge methods from `<base-repo>`, not the current
  checkout.
- Resolve an existing pull request in `<base-repo>` by its source head before creating one. For a
  fork head, use the GitHub pulls API's owner-qualified `head` filter; `gh pr list --head` does not
  accept `owner:branch`. Use the result's `html_url` and `base.ref` to apply the core
  target-mismatch rules, then refetch the selected canonical URL with `gh pr view <pr-url> --json`
  fields including `url`, `state`, `isDraft`, `headRefName`, `headRefOid`, `baseRefName`,
  `mergeable`, `mergeStateStatus`, and `statusCheckRollup`.
- Treat the exact `headRefOid` as the published source-head identity.

## Create or refresh

Push the branch explicitly before running `gh pr create`; do not depend on interactive push or fork
prompts.

Discover repository pull-request templates before composing the description. When a template
applies, preserve its required structure and fields in the completed body file. Create the pull
request with the authored title and completed description:

```text
gh pr create --repo <base-repo> --base <target> --head <head> --title <title> --body-file <body-file>
```

Do not use `--fill`; deriving the artifact from commits bypasses the authored content model and can
replace repository templates. Add `--draft` only when requested.

If the branch lookup finds an open pull request, compare `baseRefName` with the resolved target.
When the core workflow authorizes retargeting, use `gh pr edit <pr-url> --base <target>`, then
refetch and reassess the pull request. Refresh its title and body when they no longer match the
effective diff. Reuse its URL only after the targets match; never create another.

## Initial CI

Inspect required checks with:

```text
gh pr checks <pr-url> --required --json bucket,completedAt,description,link,name,startedAt,state,workflow
```

Poll only as needed to enforce the core workflow's inactivity rule. `bucket=fail` or `bucket=cancel`
is terminal; `bucket=pending` needs progress evidence before extending the wait.

## GitHub merge semantics

GitHub pull requests do not expose a true fast-forward merge. GitHub rebase merging always creates
new commit SHAs and updates committer information, even when the topic already contains the current
base. Use merge commit when exact topic commit identity must survive.
