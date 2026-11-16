# ship is one skill in the git plugin with two end points

The delivery workflow runs from implementation through `engineering:tdd`, `git:create-pr`,
`git:babysit-pr`, and `git:merge-pr`, and each skill already continues into the next when the user's
request asked for a later outcome. `git:ship` is one manual-only skill that states that request: it
takes the work from its current stage to a merged change request, or to a merge-ready one when the
invocation says so. It is one skill because a skill body cannot apply a manual-only skill, so
separate wrappers for implementing, publishing, and merging could not build on each other and would
each repeat the stage detection and the chain.

## Considered options

- **Three wrapper skills, one per stopping point.** A separate name makes each authorization more
  visible, but the three bodies would duplicate each other, and two of the stopping points already
  have a skill that stops there: `git:create-pr` at an open change request, and `engineering:tdd`
  with `git:commit` at a committed branch.
- **Place the skill in the engineering plugin.** The `git` plugin already names `engineering` skills
  in `create-pr` and `babysit-pr`, and `engineering` names no `git` skill. Placing `ship` in
  `engineering` would make each plugin depend on the other.

## Consequences

`ship` has a hard requirement on the `engineering` plugin: it checks for the plugin first and stops
when the plugin is absent, because the fallback is an unattended merge of work that no review
covered. Renaming `ship` or splitting it later is a major version bump of the `git` plugin.
