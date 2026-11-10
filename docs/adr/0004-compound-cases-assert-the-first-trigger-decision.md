# Compound cases assert the first trigger decision

A request such as "commit, push, and create a PR" chains outcomes that `git:commit` and
`git:create-pr` own, and #303 proposed that a fixture case require both skills to load during one
run. A compound case instead lists the other owners under `invoke-or` and passes when the target or
any listed skill makes the trigger decision, with no skill outside that set. The eval lanes cannot
run a skill's workflow, so a run never reaches the second load, while the first decision is
observable and varies by agent.

## Considered options

- **Require every listed skill to load, with a larger decision-item budget.** On the Claude lane,
  whose tools are `Skill`, `Read`, `Glob`, `Grep`, and `Agent`, the agent loaded `git:commit` and
  then stopped because it could not run `git`. The Codex lane runs in a read-only sandbox, where the
  commit fails the same way. No budget makes the second load appear.
- **Give compound cases a shell and a writable workspace.** The run would execute commits and pushes
  with the user's credentials in its environment, and a trigger eval would become a workflow test.
  `pressure-test-skill` already covers behavior after a skill loads.
- **Keep the chained prompt as a plain invoke case in one fixture.** In six Codex attempts on the
  prompt above, the trigger decision held `git:commit` alone twice, `git:create-pr` alone twice, and
  both twice, while Claude loaded `git:commit` first in all six. A plain case in either fixture
  fails some of those attempts as a wrong-skill invocation.

## Consequences

A passing compound case proves that one owner of the request fired first. It does not prove that the
agent later loads the other owners. A case that lists a skill is a dependent case of that skill, so
tuning the listed skill's description reruns it.
