# An invocation of ship authorizes the whole delivery

A user invokes `git:ship` to leave the loop, so a skill that asked before each outward step would
have no purpose, yet the skills it chains define stops that exist to bring the user back. An
invocation therefore authorizes the delivery plan, the commits, the change requests, the automated
review loop, a normal merge, and the cleanup after it, and it adds nothing that a chained skill
excludes. Every stop where a chained skill needs the user stays a blocker: `ship` reports it, the
user's answer resolves that blocker only, and `ship` then continues to its end point or the next
blocker.

## Considered options

- **Confirm the delivery plan before starting.** In past sessions the user delegated the split about
  as often as they confirmed one, and a stop on most runs would put the user back in the loop.
  `ship` follows a delivery plan recorded in the session, a brief, or a handoff, and otherwise
  decides the split, states it, and proceeds. A poor split costs review time and does not change
  what merges.
- **Treat `resolved-with-exceptions` as a blocker.** `git:babysit-pr` recommends the merge when
  every exception is a recorded rejection or a fix on a head the review configuration does not
  review, every thread is resolved, and CI holds, and `git:merge-pr` accepts that status. `ship`
  merges in that case and lists each exception. Every other `resolved-with-exceptions` result and
  every `blocked` status is a blocker.
- **Write the plan and each change request's status to a run record file.** Compaction happened
  mid-run in four of six studied sessions and lost neither the plan nor the merge approval, and
  `engineering:brief` and `engineering:handoff` already write a durable plan when the user wants
  one. `ship` keeps the plan and end point in the conversation and repeats both in each report.

## Consequences

When `ship` builds a stack, a review fix to a parent branch after its child change request exists is
a blocker, because `git:tidy-history` refuses a branch that an open change request targets (issue
#344).
