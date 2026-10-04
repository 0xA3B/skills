---
name: optimize-trigger
description: >-
  Evaluate and improve automatic invocation behavior for one repo plugin or repo-local skill by
  running committed trigger fixtures through Codex and Claude Code CLI harnesses. Use when the user
  asks to optimize, tune, or evaluate when a skill is implicitly triggered, or reports a skill
  triggering too often or failing to trigger. Do not use for pressure testing how a skill behaves
  after it is invoked (that belongs to pressure-test-skill) or for conceptual questions about
  trigger evals or the eval harness.
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
- Optimize trigger behavior only. Do not evaluate output quality in this workflow.

## Fixture contract

Trigger fixtures live at:

```text
plugins/<plugin>/skills/<skill>/evals/triggers.yaml
.agents/skills/<skill>/evals/triggers.yaml
```

Each fixture file must include both positive and negative cases:

```yaml
version: 1
cases:
  - id: commit-message-request
    prompt: >-
      Draft a Conventional Commit message for these changes.
    expect: invoke
    rationale: The user is asking for commit message policy help.

  - id: conceptual-question
    prompt: >-
      What is the purpose of Conventional Commits?
    expect: skip
    rationale: The user is asking a conceptual question, not requesting the workflow.

  - id: project-convention-conflict
    prompt: >-
      Commit these changes.
    workspace_files:
      AGENTS.md: |
        Commit messages must use Gitmoji, not Conventional Commits.
    expect: skip
    rationale: Repository instructions require a different workflow than this skill owns.

  - id: adjacent-workflow
    prompt: >-
      Open a pull request for this branch.
    expect: skip
    invoke-instead: git:create-pr
    rationale: Opening the PR belongs to create-pr.
```

Use positive cases for natural prompts that should load the skill. Keep them representative of real
user intent rather than asking the model to choose a workflow, because workflow-selection wording
can muddy the trigger signal. Use negative cases for nearby prompts that should not load it,
especially conceptual questions, adjacent workflows, or requests owned by a different skill.

When the request in a skip case belongs to another implicitly invokable skill of the same kind, add
a routing assertion: `invoke-instead: <label>` names that alternate, and the case passes only when
the alternate is the only skill that fires. A plugin fixture names a plugin skill as
`<plugin>:<skill>`; a repo-local fixture names a repo-local skill by its bare name. Otherwise leave
the case a plain skip; `pnpm lint:plugins` rejects an alternate that is missing, manual-only, of the
other kind, or absent from a plugin target the fixture's plugin ships on.

When the skill's workflow applies another skill in a step, list its label under a top-level
`applies:`. When a `wrong-skill` result names a skill the workflow applies, declare it there;
otherwise fix the descriptions.

Make every standalone case actionable. When a prompt refers to a file, branch, prior response, or
artifact that the prompt does not contain, add the smallest representative `workspace_files` input
or embed the needed text in the prompt. Missing input can make an agent inspect the empty fixture or
ask for context before selecting a skill, which measures task viability instead of invocation.

A case runs in an empty directory unless it resolves to a `workspace` block or a non-empty
`workspace_files` map, from the case or the fixture default. When a prompt assumes a plausible
project — "review the staged changes", "fix the regex in parseIso", "where should the seam go" —
declare a workspace seed:

```yaml
version: 1
workspace: # fixture-level default; applies to skip cases too
  seed: node-service # evals/seeds/node-service/
  branch: main # optional
  committed: {}
  staged: {}
workspace_files: {} # fixture-level default, merged per path with the case's own (case wins)
cases:
  - id: example
    workspace: { seed: node-service, staged: { src/retry.js: "..." } } # replaces the default
    workspace_files: {}
  - id: other
    workspace: none # opts out of the fixture default
```

Every seeded workspace is a git repository with no remote and one commit holding the seed, the
`committed` files, and the evaluated agent's config surfaces; `staged` files are then added to the
index and `workspace_files` stay unstaged. A seed's own `.gitignore` shapes the seed commit only;
`committed` and `staged` files are always added. A seed holds plain project content: regular files
and directories with no symlink and no `.git` at any depth. The harness owns `.git`, `.agents`, and
`.claude`, rejects any fixture file path under those entries, and leaves a seed's `.agents` and
`.claude` entries out of the copy. Fixture file paths are POSIX-style relative file paths. Without a
`workspace` block, `workspace_files` alone writes plain files with no git repository.

Seed ownership is one-way: tailor a case to a seed through the `committed`, `staged`, and
`workspace_files` layers, and never edit a seed for one case.

Prefer cheap boundary-question negatives when the nearby workflow would otherwise do substantial
work, such as asking which workflow owns plugin creation or metadata updates. Use action-style
negative prompts only when the near miss itself is important to test. Use `workspace_files` for
cases where loaded repository instructions should affect the trigger boundary, such as an
`AGENTS.md` commit convention.

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
   Use `--agent codex` or `--agent claude` to run one agent at a time; while wording changes,
   iterate with diagnostic runs.

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
   before you interpret the results. `report.json` records the same fields.
7. For false negatives, make the description more explicit about the missing user intent.
8. For false positives, narrow the description with clearer ownership boundaries or exclusions. When
   only Claude Code needs different tuning, prefer adding or adjusting the Claude-only `when_to_use`
   frontmatter key over forking the shared `description`: Claude appends `when_to_use` to the
   description in its skill listing (combined text truncated at 1,536 characters), while Codex
   ignores the key entirely.
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

## Harness notes

- The runner writes reports and Codex homes under `.local/skill-evals/`, and creates staged
  workspaces outside the repository so only deliberately staged skills are loadable — the parent
  checkout's live skills never leak into the trigger signal. On both lanes, staged plugin deployment
  copies and the Codex marketplace catalog are siblings of the case workspace rather than project
  files, matching an installed session and keeping them out of project reconnaissance.
- Runtime state is removed as the run goes: each attempt's Codex home once its output is captured,
  and the staged workspaces and run home when the run ends, whether it completed, failed, timed out,
  or was canceled. `report.json` and each attempt's `events.jsonl`, `final.txt`, and `stderr.log`
  under `cases/<case-id>/attempt-<n>/` stay. Pass `--keep-runtime` to retain the homes and
  workspaces for debugging, though the copied `auth.json` is still removed; a directory the runner
  could not remove is printed as a warning and never fails the run.
- Cases with a `workspace` block or `workspace_files` run in an attempt-specific copy of the staged
  workspace. The runner builds the seeded repository identically on both lanes, with a harness-owned
  git identity and signing disabled, so the machine's git configuration cannot affect a run.
- The committed `description` remains the trigger surface under test. Staged skill copies are
  byte-identical to the committed skills on both lanes.
- The runner stops the agent CLI once it observes the invocation signal, except on Codex while a
  skill-file read is pending until the next assistant message, so positive cases do not need to
  finish the requested workflow.
- Negative cases stop early too: once the lane's budget of decision-bearing items completes without
  an invocation signal, the run is stopped and classified as a clean skip. The Claude lane allows
  five items and counts text-only assistant turns and non-read tool calls; thinking and `Read`,
  `Glob`, or `Grep` reconnaissance do not consume the budget. The Codex lane allows eight and counts
  every non-reasoning completed item, because its generic command events do not reliably distinguish
  read-only reconnaissance and the model inspects a seeded workspace before it loads a skill.
- Codex has no skill tool or skill event, so on Codex a successful command that prints a staged
  `SKILL.md` from its first line is the invocation. `src/trigger-evals/lanes/skill-reads.ts` owns
  the load and inspection forms; a command naming a staged `SKILL.md` in another form is reported as
  ERROR, and classifying that form is a harness attribution change. A whole-file read made to answer
  a question about a skill still counts, so read `events.jsonl` before tuning a conceptual case that
  fails only on Codex.
- A skill loaded in the same run as a skill whose fixture lists it under `applies` is a dependency
  load of that skill's workflow, not a second trigger decision, and the verdict drops it whatever
  the read order; two skills that apply each other both stay invocations. The case line lists the
  dropped loads after `dependency loads`.
- Every staged skill keeps its real invocation policy, and the lane watches each implicitly
  invokable staged skill, so invoking the wrong skill is a distinct, attributable observation. A
  `wrong-skill` result names a plugin skill as `<plugin>:<skill>` and a repo-local sibling by its
  bare skill name. It fails an invoke case — even when the target also fires, because simultaneous
  invocation is itself trigger-contract overlap — and is surfaced on passing skip cases too, because
  either direction exposes overlap between loaded skills.
- On Claude Code, the runner launches `claude -p` with a read-only tool surface and classifies
  invocation from Skill tool events in the stream-json output. Plugin skills load from the staged
  plugin copy via `--plugin-dir`; repo-local skills load from the staged `.claude/skills/` copy.
- Claude workspaces stage project-only `.claude/settings.json` with `disableBundledSkills: true` so
  bundled skills such as `code-review` do not compete with the target. The runner verifies the
  isolation at runtime: each Claude case checks the init event's `skills` list against the staged
  set (plus the exempt list in `verdict.ts`) and reports an environmental failure when unstaged
  skills leak in, because a leaked skill can steal or provoke an invocation in either direction.
- Staging is lane-specific: only the evaluated agent's config surfaces are written into the
  workspace (`.claude/` for Claude, `.agents/` for Codex), so the other agent's files never pollute
  the workspace under test.
- Attempt pass/fail is based on matching the expected invoke or skip classification, and a case
  passes only when every attempt passes. Exec errors and timeouts remain in the report because
  trigger evals do not validate workflow completion.
- Skip verdicts record how the run ended: natural completion, the decision-item budget, or the case
  timeout. Timeout skips are annotated as weak signals because the model might have invoked after
  the cutoff; treat a fixture that repeatedly skips only via timeout as unresolved, not passing.
- Run trigger evals from an unsandboxed context. The per-case CLI subprocesses apply their own OS
  sandbox and need network and home-directory access, so driving the harness from inside a sandbox
  (a sandboxed Codex session, a sandboxed Bash tool call) kills every case before it executes —
  macOS refuses to nest a second Seatbelt sandbox. The runner reports such cases as ERROR with an
  environmental-failure note instead of counting the dead run as a skip.

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
- Do not make the script edit descriptions automatically.
- Do not add trigger evals to `mise exec -- pnpm check`; this is a development workflow, not a
  routine gate.
