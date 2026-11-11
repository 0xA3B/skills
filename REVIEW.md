# Review rules

Every reviewer of a change in this repository applies these rules: a review bot, a review lane, and
an agent that triages review findings. The root `AGENTS.md` routes here from its
`## Code Review Rules` section.

## All changes

- Rate each finding by the consequence of leaving it unfixed; when that failure is loud or has a
  recovery path, name the signal or path that bounds it.
- When a finding reports a failure path, state whether an observed run reached it (real use of the
  changed workflow or tool) or the reviewer derived it by enumerating states, inputs, or
  configurations. Report an enumerated path as a finding only when its failure is silent, meaning a
  passing status over a wrong result, or when it changes or leaks state outside the run; otherwise
  put it in the review summary as a note for the author.
- In repository tooling (`scripts/`, `src/`, `.agents/skills/*/scripts/`), report as a finding only
  a defect that yields a wrong result under a passing status, changes or leaks state outside the
  run, or breaks the tool's normal use; report every other defect there as a note. Scripts bundled
  under `plugins/` are plugin content, not repository tooling.
- When a tooling change reproduces external state, such as a repository copy, and a finding concerns
  a case the reproduction does not support, recommend that the tool refuse that case with a visible
  error rather than reproduce it, and state whether the finding asks for refusal or reproduction.
- When reporting one case of a mechanism, list every sibling case in the same finding so one round
  fixes the set; for a record's lifecycle, these are each state, each location the record can live
  in, and each transition between them.
- Prefer a remedy that deletes code or text, narrows an absolute, or delegates to the owner of the
  mechanism over one that adds a special case beside the code or rule under review.
- When a finding's only evidence is the previous round's fix, say so and ask for that fix to be
  reshaped instead of reporting a new case beside it.

## Changes under `src/` or `tests/`

- In the Codex skill-read classifier (`src/trigger-evals/lanes/skill-reads.ts`), report a shell form
  as a finding only when a recorded Codex run used it. Report a form derived from shell syntax as a
  note, even when its failure is silent: observed Codex commands set the classifier's scope.

## Canary

This section tests whether each review bot reads this file (#310). Remove it once a reviewed pull
request shows the result for each bot.

- When a changed line contains the token `review-canary`, report it as a finding that names this
  rule.
