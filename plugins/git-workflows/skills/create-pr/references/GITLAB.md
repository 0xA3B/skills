# GitLab Merge Requests

Use this reference only after selecting a GitLab remote.

Commands and fields below are exemplars of the stated invariants. If the installed CLI lacks one,
use an equivalent CLI or API path that preserves the invariant and report the deviation.

## Inspect

- Follow loaded authentication and environment guidance before mutating `glab` operations.
- Resolve project defaults and merge policy through `glab api` when `glab mr view` does not expose
  enough project metadata.
- Resolve an existing merge request by branch with `glab mr view <branch> --output json`.
- Treat the merge request's source-branch SHA as the published source-head identity.

## Create Or Refresh

Push the branch explicitly before creation. `--fill` derives the title and description from commits
and bypasses merge-request templates. When the repository defines a suitable template, the template
wins: use `--template <name>` for the description and take the title from the commits or an explicit
`--title` instead of `--fill`. Without a template, prefer a non-interactive command shaped like:

```text
glab mr create --source-branch <topic> --target-branch <target> --fill --yes
```

Provide an explicit title or description only when required by repository rules or user content. Add
`--draft` only when requested. Do not enable `--auto-merge`.

If `glab mr view <topic>` finds an open merge request, reuse it rather than creating another.

## Initial CI

Inspect the source branch's current pipeline with:

```text
glab ci status --branch <topic> --output json
```

Use `glab api` when the CLI summary cannot distinguish pipeline or job progress. A running job whose
steps or trace continue advancing may exceed the core ten-minute inactivity threshold.

## GitLab Merge Semantics

GitLab projects may support fast-forward merge, merge commit, or semi-linear history. A true
fast-forward preserves topic commits and their identities. Server-side rebase rewrites commits and
removes GPG signatures, so do not select it when signature preservation matters.
