# Candidate records

A candidate record captures pending work with a condition attached: a change a workflow proposed and
set aside until a stated trigger fires. Each record has a kind, `architecture` or `tests`, named by
the workflow that applies this reference. A candidate record is not a decision record; a choice that
passes the gates in `engineering:decision-records` gets a record there instead.

## Write

When the session can reach the project's issue tracker, record each set-aside candidate as one issue
labeled `candidate:<kind>`; for GitHub, `gh issue create --label candidate:<kind>`. If the label is
missing, create it first, for GitHub `gh label create candidate:<kind>`; if the session cannot
create labels, treat the tracker as unreachable. When the tracker is unreachable, write the same
content to one file per candidate under `candidates/<kind>/` in the repository's ignored scratch
directory, confirming the path is ignored with `git check-ignore` before writing; when no ignored
convention exists, put the content in the final response. When the candidate already has a record,
update that record's date, area, reason, and trigger instead of writing a second one. Each record
carries:

- the date the record was written;
- the area: the files, modules, or suites involved;
- the evidence the candidate rests on, with command output where a run demonstrates it;
- the reason it was set aside;
- a revisit trigger written as a statement a later pass can check against history, such as "the
  manifest layout changes" or "a third caller of `parseFixture` appears".

For a candidate the user declined, the trigger is the condition under which the decline reason stops
holding. For work that is due now and set aside only because it exceeds the current scope, the
trigger is the next pass over its area.

## Read

Before scanning an area, list the open candidates of this kind whose area overlaps it: the tracker's
open `candidate:<kind>` issues, for GitHub
`gh issue list --label candidate:<kind> --state open --limit 500 --json number,title,body`, plus
every file under `candidates/<kind>/` in the ignored scratch directory when that directory exists.
Check each revisit trigger against the history since the record's date. A candidate whose trigger
fired enters the pass with its recorded evidence. Leave a candidate whose trigger has not fired open
and out of this pass; when this pass finds new evidence for it, add the evidence to its existing
record.

## Close

When this pass implements a candidate, add a closing reference to its record in the change request,
for GitHub `Closes #<number>` in the description, so the merge closes it; when no change request
will carry the implementation, close the record once the implementation lands. When this pass
invalidates a candidate, or declines it for a reason that `engineering:decision-records` now holds,
close the record and state the reason in the closing comment. A scratch record closes by deleting
its file.
