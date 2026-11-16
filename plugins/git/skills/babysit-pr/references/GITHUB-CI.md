# GitHub required CI

Contents: Observe, Attribute, Repair, Stop.

Use this reference when a required check on the current source head is pending, failed, errored, or
cancelled. It decides whether the change request caused a failure, and repairs only a failure the
change request caused.

## Observe

Inspect required checks with the canonical pull-request URL, unsandboxed, because `gh` reads
credentials from the keyring:

```text
gh pr checks <pr-url> --required --json bucket,completedAt,description,link,name,startedAt,state,workflow
```

When the command reports that the repository requires no check, drop `--required` and treat every
check on the head as required.

- `bucket=pass` or `bucket=skipping`: the check needs nothing.
- `bucket=pending`: wait while a job, step, log, or state advances. After ten minutes without
  progress, return the CI gate `blocked` as timed out and name the pending checks.
- `bucket=fail`: go to Attribute.
- `bucket=cancel`: when the check is a GitHub Actions job that this invocation has not rerun, rerun
  its run once with `gh run rerun <run-id>`, where Attribute defines `<run-id>`, then observe again.
  Otherwise return the CI gate `blocked` and name the cancelled check.

## Attribute

Read the failing log first, with `gh run view <run-id> --log-failed` for a GitHub Actions job or
through the check's `link` otherwise. In the commands here, `<run-id>` is the number after
`/actions/runs/` in the check's `link`, `<check-name>` is its `name`, and `<owner>/<repo>` and
`<base-branch>` are the forge-side base repository and the target branch. Then take the first case
that applies:

1. The same check fails on the base branch's latest completed run: the failure predates the change
   request. Return the CI gate `blocked`, report both runs, and repair nothing. Find that run with,
   for example:

   ```text
   gh api "repos/<owner>/<repo>/commits/<base-branch>/check-runs?check_name=<check-name>&status=completed"
   ```

2. The log shows a deterministic failure in a file or behavior the change request changes, such as a
   lint error on a changed line: the change request caused the failure. Go to Repair.
3. The check is a GitHub Actions job that this invocation has not rerun: rerun it once with
   `gh run rerun <run-id> --failed`, then observe again. When the rerun passes, the failure was
   flaky: report the check with both runs and repair nothing.
4. The check passes on the base branch's latest completed run: the change request caused the
   failure. Go to Repair.
5. Otherwise the failure is unattributed, such as a check with no completed run on the base branch
   and a log that names nothing the change request changes: return the CI gate `blocked` with the
   log excerpt that shows the failure.

## Repair

1. When the log shows the cause, fix it. Otherwise apply `engineering:diagnose` to find the cause.
2. Keep the fix within the change request's own surface and tests. When the fix needs a change
   outside that surface, such as CI configuration or a dependency the change request does not touch,
   return the CI gate `blocked` with the cause and the proposed fix as a user decision.
3. When the repository has a script that runs the check locally, run it and require it to pass
   before the push.
4. Hand the fix to the round's push as `3. Triage and respond` directs, and observe the new head.

## Stop

When the same check fails on the head after two repair pushes in one invocation, return the CI gate
`blocked` with both attempts and the current log excerpt.
