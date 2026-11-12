---
name: optimize-trigger
description: >-
  Use whenever the session changes or evaluates when a plugin or repo-local skill in this repository
  is implicitly invoked: tunes, rewrites, or shortens its `description` or `when_to_use`, changes
  its trigger fixtures, runs its trigger evals, or investigates a report that it triggers too often
  or fails to trigger. Do not use to test how a skill behaves after it is invoked
  (pressure-test-skill).
license: MIT
argument-hint: "[skill-path]"
---

# Optimize trigger

Repo-local workflow for improving when a plugin skill is automatically invoked. This skill owns
fixture review, eval execution, failure interpretation, and description edits. The eval script only
runs cases and reports evidence.

## Outcome

Improve one skill's implicit trigger behavior until committed trigger fixtures pass, or report the
specific fixture, harness, or description problem that blocks progress.

Stop when trigger evals pass for the target skill, when `policy.allow_implicit_invocation: false`
makes the workflow inapplicable, or when the remaining failures require a user decision about the
skill's intended trigger boundary.

## Target scope

- Target repo plugin skills under `plugins/<plugin>/skills/<skill>/` or repo-local skills under
  `.agents/skills/<skill>/`.
- Use this workflow only for implicitly invokable skills: `policy.allow_implicit_invocation: true`
  in `agents/openai.yaml`, mirrored by SKILL.md frontmatter without `disable-model-invocation`.
  Claude-only skills that ship no `agents/openai.yaml` are gated by the frontmatter key alone on the
  Claude lane.
- If the target skill is manual-only, warn the user and do not optimize trigger behavior unless they
  explicitly ask for advisory review.

## References

- Before you review, add, or change a fixture case, read
  [fixture-contract.md](references/fixture-contract.md) for the case format, routing assertions,
  compound cases, `applies`, and workspace seeds.
- Before you interpret a FAIL, ERROR, `wrong-skill`, dependency-load, or timeout result, or debug a
  run, read [harness-notes.md](references/harness-notes.md) for how the runner stages skills,
  classifies an invocation on each agent, and ends a case.

## Workflow

1. Inspect the target skill's `SKILL.md`, `agents/openai.yaml`, and `evals/triggers.yaml`.
2. Confirm `policy.allow_implicit_invocation: true`. If false, warn and stop.
3. Review fixture coverage before running the eval:
   - at least one clear positive case
   - at least one clear negative case
   - near-miss cases that exercise the description boundary
4. Separate diagnostic runs from gate runs. A diagnostic run is a run narrowed to one case with
   `--case <id>` and without `--with-dependents`, allowed while wording changes; every other run,
   including the target's full fixture, is a gate run. Run gate runs without `--repeat`, which
   multiplies eval time. Start a gate run only when each condition that applies holds:
   - If any skill's `description` or `when_to_use` differs from `main`, or from the version this
     tuning pass started with, in more than mechanical or incidental wording, the prose lane of
     `engineering:review-changes` has reviewed the exact wording the gate run evaluates, and its
     accepted fixes are applied. A wording edit after that review needs another review before the
     next gate run.
   - If the branch or this tuning pass changes harness code, the code lanes
     `engineering:review-changes` selects for it have reviewed the harness code the gate run
     exercises, and their accepted fixes are applied.
5. Run the target's own fixture:

   ```bash
   mise exec -- pnpm eval:trigger -- plugins/<plugin>/skills/<skill> --agent both
   mise exec -- pnpm eval:trigger -- .agents/skills/<skill> --agent both
   ```

   The `description` is one trigger contract shared by both agents, so skills should pass on both.
   Use `--agent codex` or `--agent claude` to run one agent at a time. Run every trigger eval
   unsandboxed: each case's agent CLI applies its own sandbox, and inside another sandbox every case
   ends as ERROR with an environmental-failure note.

   Every run stages the target's deployment context by default. A plugin skill competes against
   every plugin in the agent's marketplace catalog, matching an installed session. A repo-local
   skill additionally competes against every repo-local skill in this checkout, matching this
   repository's sessions. Repo-local skills never stage when the target is a plugin skill: they do
   not exist where the plugins are installed.

   Because staging spans the marketplace, a description change in one plugin can flip another
   skill's results. When a result line names a competing skill as `wrong-skill <label>`, fix the
   boundary between the two descriptions, not the target's wording alone. On a routing assertion,
   `alternate <label>` marks the named alternate firing alone, the passing outcome; any other skill
   still prints as `wrong-skill`.

   Two suite selections widen which fixtures run; staging is unchanged:
   `mise exec -- pnpm eval:trigger:plugin -- plugins/<plugin>` runs every implicitly invokable
   skill's fixtures in the plugin, and `mise exec -- pnpm eval:trigger:marketplace` runs every
   fixture in the agent's marketplace catalog.

   To retest a few skills, pass skill paths to the marketplace selection:
   `mise exec -- pnpm eval:trigger:marketplace -- plugins/<plugin>/skills/<skill> [more paths] --agent both`
   runs only the named skills' fixtures. A selected skill whose plugin ships in only one agent's
   catalog is skipped with a notice on the other agent's lane. For one skill, use the plain
   single-skill run; `--case <id>` and `--fixture <path>` narrow it to one flaky case.

   The default per-case timeout is 60 seconds because trigger evals measure whether the skill is
   invoked, not whether the requested workflow completes.

   Evals pin the default models to the ones this repository's skills are used with day to day:
   `gpt-6.1-sol` for Codex and `opus` for Claude Code, both at `medium` reasoning effort. Trigger
   boundaries are model-specific, so the defaults measure real invocation behavior instead of a
   smaller-model proxy. Use `--model` and `--effort` to spot-check other models or match a different
   working setup.

6. Read the report and failed case outputs under `.local/skill-evals/trigger/`. Before you edit a
   description for a FAIL, confirm that the `Checkout:` line names the checkout and branch under
   test, and that each `Agent:` line names the model you selected and the same agent version as any
   run you compare against. If a line does not match, rerun from the correct checkout or agent
   before you interpret the results. `report.json` records the same fields. Treat a case that skips
   only by timeout, printed as a weak signal, as unresolved, not passing.
7. Fix a failed case in the predicate first, as "Trigger contracts" in `writing:agent-instructions`
   directs: for a false negative, restate the predicate over the work; for a false positive, narrow
   it, and add an exclusion only when another skill owns the request or the case still fails. After
   the fixture passes, drop each exclusion whose case passes a diagnostic run without it.
8. When only Claude Code needs different tuning, adjust the Claude-only `when_to_use` frontmatter
   key instead of forking the shared `description`: Claude appends `when_to_use` to the description
   in its skill listing (combined text truncated at 1,536 characters), while Codex ignores the key
   entirely.
9. When a repo-local target overlaps a marketplace skill — a `wrong-skill` result in either
   direction — fix the repo-local description. Marketplace descriptions serve every installation;
   edit one only when the overlap would also misfire in a session without the repo-local skills.
10. After edits, rerun as a diagnostic run with `--case <id> --repeat 5` each case that failed in
    any run of this tuning pass, even when it passed since, and each case the user or an open issue
    names as flaky. Count the case fixed only at `5/5 passed`; any lower tally keeps the case a
    failure, including a flaky one. If an attempt prints ERROR, fix the environment and rerun before
    you judge the case. Otherwise fix the case or the description; deleting a flaky case, changing
    its expectation, or leaving it out of the gate run is a user decision. When step 4's gate
    conditions hold, rerun with `--with-dependents` the fixtures of every skill whose `description`
    or `when_to_use` changed and every skill named in `wrong-skill` results. For plugin skills, one
    marketplace selection covers several:
    `mise exec -- pnpm eval:trigger:marketplace -- <skill-path> [more paths] --agent both --with-dependents`.
    The marketplace selection refuses a repo-local path, so rerun a repo-local target one at a time:
    `mise exec -- pnpm eval:trigger -- <skill-path> --agent both --with-dependents`. The flag runs
    each selected skill's dependent cases under their own fixtures and lanes. After a seed edit,
    rerun the seed's seeded cases: `mise exec -- pnpm eval:trigger -- --seed <seed> --agent both`.
11. Run repository validation for changed files:

    ```bash
    mise exec -- pnpm lint:plugins
    mise exec -- pnpm format:check
    mise exec -- pnpm lint
    mise exec -- pnpm typecheck
    ```

## Boundaries

- Before editing a skill other than the target to fix a `wrong-skill` result, look for that skill's
  open `feedback` issues with a `wait` disposition and its records in `.local/feedback-deferred/`.
  If either exists, leave that skill unchanged and report the `wrong-skill` result with the record.
- Treat a change to how the harness attributes an invocation, such as a verdict or dependency-load
  rule, as a user decision: present the failing cases and the proposed rule, and implement it only
  after the user decides.
- Change skill behavior or body instructions only when the trigger boundary requires it. Add an
  `applies` entry, and the body reference it requires, only when that body's workflow applies the
  referenced skill in a step; an entry added so the harness drops a load as a dependency load hides
  real overlap.
- Do not add trigger evals to `mise exec -- pnpm check`; this is a development workflow, not a
  routine gate.
