# GitHub pull request merge

Use this reference only after selecting a GitHub pull request.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation. Use the
canonical `<pr-url>` for every `gh pr` command so a fork checkout cannot redirect the operation to
its default repository. Use `<pr-number>` only in the merge commit message.

## Inspect native gates

- Follow loaded account-routing guidance before identity-sensitive or mutating `gh` operations.
- Inspect `gh pr view <pr-url> --json` fields including `state`, `isDraft`, `headRefOid`,
  `baseRefName`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `reviewRequests`,
  `statusCheckRollup`, `autoMergeRequest`, `mergedAt`, and `mergeCommit`.
- Inspect required checks with `gh pr checks <pr-url> --required --json`.
- Query pull-request review threads through `gh api graphql`; require every returned thread's
  `isResolved` value to be true, regardless of author.
- When a thread still needs a reply or resolution, use the same GraphQL surface: the
  `addPullRequestReviewThreadReply` and `resolveReviewThread` mutations, fed by the thread `id` from
  that query. `gh` has no native subcommand for either action.

Do not treat `mergeStateStatus=CLEAN` or green CI as proof that a non-required bot review passed.

## Merge

GitHub pull requests do not support true fast-forward merge. Select `--rebase`, `--merge`, or
`--squash` under the core policy. Guard the operation with:

```text
gh pr merge <pr-url> --match-head-commit <head-sha> <method-flag>
```

For a merge commit, preserve a repository-defined merge-message convention. Otherwise pass the
Conventional Commit pull-request title as `--subject`, followed by `(#<pr-number>)` when it fits the
repository's subject limit. When the reference does not fit the subject, pass `(#<pr-number>)`
through `--body` so the merge message retains it.

Do not pass `--auto`. Pass `--admin` only when the core workflow's same-invocation authorization and
repository-policy gates are satisfied; otherwise stop on the protection. Do not request branch
deletion in the merge command; verify the remote result first.

When a protected target requires a merge queue, checks must already pass before invoking merge. The
command should add the pull request to the queue. Poll `gh pr view <pr-url>` until `state=MERGED`
and `mergedAt` is present, or until the core queue timeout expires.

## Verify and delete

Refetch the target and pull-request metadata. GitHub rebase merge rewrites every topic commit;
squash creates one new commit; merge commit preserves topic commits and adds a merge commit. Verify
the result according to that method rather than assuming the original head is an ancestor.

After verification, check whether the remote head ref still exists. Delete it through the
appropriate authenticated remote only when the pull request is merged and the head repository
permits deletion. Then fetch with prune before local cleanup.
