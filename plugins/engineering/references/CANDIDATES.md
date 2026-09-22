# Candidate records

A candidate record captures pending work with a condition attached: a change a workflow proposed and
set aside until a stated trigger fires. A candidate record is not a decision record; a choice that
passes the gates in `engineering:decision-records` gets a record there instead.

## Write

When the session can reach the project's issue tracker, record each set-aside candidate as one issue
labeled `candidate`; for GitHub, `gh issue create --label candidate`. If the label is missing,
create the issue without it and name the missing label in the report. When the tracker is
unreachable, write the same content to the repository's ignored scratch directory, confirming the
path is ignored with `git check-ignore` before writing; when no ignored convention exists, put the
content in the final response. Each record carries:

- the area: the files, modules, or suites involved;
- the evidence the candidate rests on, with command output where a run demonstrates it;
- the reason it was set aside;
- a revisit trigger written as a statement a later pass can check against history, such as "the
  manifest layout changes" or "a third caller of `parseFixture` appears"; for a candidate the user
  declined, record the decline reason in place of a trigger, so no later pass re-proposes it.

## Read

Before scanning an area, list the open candidates whose area overlaps it; for GitHub,
`gh issue list --label candidate --state open`. Check each revisit trigger against the history since
the record was written. A candidate whose trigger fired enters the pass with its recorded evidence.
Leave a candidate whose trigger has not fired open and out of this pass; when this pass finds new
evidence for it, add the evidence to its existing record.

## Close

When this pass implements a candidate, add a closing reference to its record in the change request,
for GitHub `Closes #<number>` in the description, so the merge closes it. When this pass invalidates
a candidate, or declines it for a reason that `engineering:decision-records` now holds, close the
record and state the reason in the closing comment.
