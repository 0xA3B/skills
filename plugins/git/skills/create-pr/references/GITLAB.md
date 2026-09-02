# GitLab merge requests

Use this reference only after selecting a GitLab remote.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation. `<topic>`
is the topic branch name and `<mr>` is the merge request number; `glab` accepts the branch name
wherever it accepts a number.

## Inspect

- Follow loaded account-routing guidance before identity-sensitive or mutating `glab` operations.
- Resolve project defaults and merge policy through `glab api` when `glab mr view` does not expose
  enough project metadata.
- Resolve an existing merge request by branch with `glab mr view <branch> --output json`.
- Treat the merge request's `sha` field from `glab mr view <topic> --output json` as the published
  source-head identity.

## Create or refresh

Push the branch explicitly before creation. Discover project merge-request templates before
composing the description. When a template applies, preserve its required structure and fields in
the completed body file. Create the merge request non-interactively with the authored title and
completed description:

```text
glab mr create --source-branch <topic> --target-branch <target> --title <title> --description-file <body-file> --yes
```

Do not use `--fill`; deriving the artifact from commits bypasses the authored content model and can
replace repository templates. Add `--draft` only when requested. Do not enable `--auto-merge`.

If `glab mr view <topic>` finds an open merge request, compare its target branch with the resolved
target. When the core workflow authorizes retargeting, use
`glab mr update <mr> --target-branch <target> --yes`, then refetch and reassess the merge request.
Refresh its title and description when they no longer match the effective diff. Reuse it only after
the targets match; never create another.

## Initial CI

Inspect the source branch's current pipeline with:

```text
glab ci status --branch <topic> --output json
```

A pipeline status of `failed` or `canceled` is terminal; `running`, `pending`, or `created` needs
progress evidence before extending the wait. Use `glab api` when the CLI summary cannot distinguish
pipeline or job progress. A running job whose steps or trace continue advancing may exceed the core
workflow's inactivity threshold.

## GitLab merge semantics

GitLab projects may support fast-forward merge, merge commit, or semi-linear history. A true
fast-forward preserves topic commits and their identities. Server-side rebase rewrites commits and
removes GPG signatures, so do not select it when signature preservation matters.
