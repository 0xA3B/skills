# Retired skills

Skills removed from distribution but kept readable for later review. Nothing here ships: the
directories carry no plugin manifest, no marketplace entry, and no eval coverage, so no agent loads
them. To use one temporarily, symlink its directory into your agent's user-level skills directory
for the session.

A retired skill keeps its files as they were at retirement. The entry below is the record; the git
history holds the rest.

## Index

### engineering-workflows/build

- Retired: 2026-09-04, last shipped in engineering-workflows 1.8.2.
- Reason: unused since at least 2026-07. Its two rationales are absorbed elsewhere. Interface
  instability is handled inside `tdd` by putting the first tests at the outermost stable surface;
  dependency preferences are user-level conventions. Keeping it as the exit from `tdd`'s discipline
  checks gave the loop a rationalization escape.
- Absorbed by: `engineering-workflows:tdd` for implementation, `engineering-workflows:prototype` for
  disposable evidence.
- Revisit when: a greenfield implementation under `tdd` produces test churn that the frontier
  refactor pass and the outermost-stable-surface rule do not contain.

### engineering-workflows/review-branch

- Retired: 2026-09-05, last shipped in engineering-workflows 1.8.2.
- Reason: it existed for one case, a branch the user authored in an earlier session, which the
  user's workflow does not produce. Reviewing another person's branch, PR, or MR was already outside
  its contract.
- Absorbed by: `engineering-workflows:review-changes` for session-authored work of any git shape.
- Revisit when: designing a peer-review skill for branches, PRs, and MRs the session did not author.
  The "Decision first, edits second" section and the base-resolution order are the raw material for
  that skill's interactive, decision-first posture.
