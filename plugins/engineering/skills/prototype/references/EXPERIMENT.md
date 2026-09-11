# Experiment prototype

Change a worktree copy of the project and run the real command to learn whether an existing system
accepts the change or how a tool, command, or external integration behaves. The evidence is the
difference between a control run and a changed run, so the control run is mandatory: without it a
failure cannot be attributed to the change.

## Process

1. State the question as a falsifiable claim and name the command that decides it, for example: "The
   test runner resolves fixtures from a directory outside the package; `pnpm test` passes after the
   move."
2. Run the control: execute the deciding command against the unchanged worktree and record the
   result. When the result carries variance, such as a model, a network, or timing, repeat the run
   until the outcome is stable across at least two runs. If the control already fails, stop and
   report the environment problem.
3. Make the smallest change that tests the claim; repoint an existing test only when the change
   breaks it and the deciding command needs it green.
4. Run the deciding command against the changed worktree under the same stability rule as the
   control, so both conditions rest on the same number of runs.
5. Record the diff, the control and changed results side by side, and every observation that was not
   the question, such as a pre-existing defect the control exposed.

## Report

Report, in this order:

- A verdict per claim: yes, no, or not attributable, with the run that decides it.
- A table of runs: control and each changed run, with the observed result per case.
- The diff, trimmed to substantive hunks.
- The validation state of the changed worktree, such as typecheck and tests, when the deciding
  command depends on it.
- Other observations.

The first three report items are the experiment's extract; `SKILL.md ## Placement` owns what happens
to it.
