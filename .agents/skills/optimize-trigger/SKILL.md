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
```

Use positive cases for natural prompts that should load the skill. Keep them representative of real
user intent rather than asking the model to choose a workflow, because workflow-selection wording
can muddy the trigger signal. Use negative cases for nearby prompts that should not load it,
especially conceptual questions, adjacent workflows, or requests owned by a different skill.

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
4. Run:

   ```bash
   mise exec -- pnpm eval:trigger -- plugins/<plugin>/skills/<skill> --agent both
   mise exec -- pnpm eval:trigger -- .agents/skills/<skill> --agent both
   ```

   The `description` is one trigger contract shared by both agents, so skills should pass on both.
   Use `--agent codex` or `--agent claude` to iterate on one agent at a time. The harness stages
   repo-local skills under `.agents/skills/` for Codex and `.claude/skills/` for Claude Code,
   mirroring how the checkout's `.claude/skills` symlink exposes them in live sessions.

   Every run stages the target's deployment context by default. A plugin skill competes against
   every plugin in the agent's marketplace catalog, matching an installed session. A repo-local
   skill additionally competes against every repo-local skill in this checkout, matching this
   repository's sessions. Repo-local skills never stage when the target is a plugin skill: they do
   not exist where the plugins are installed.

   Because staging spans the marketplace, a description change in one plugin can flip another
   skill's results. When a case fails and the cause is unclear, add `--isolated` to stage only the
   target's own surface (its plugin, or the repo-local skill alone) and compare: a case that passes
   isolated but fails under default staging is losing to a competing description, not failing on its
   own wording.

   Two suite selections widen which fixtures run; staging is unchanged:
   `mise exec -- pnpm eval:trigger:plugin -- plugins/<plugin>` runs every implicitly invokable
   skill's fixtures in the plugin, and `mise exec -- pnpm eval:trigger:marketplace` runs every
   fixture in the agent's marketplace catalog, exercising every cross-plugin boundary in one pass.

   To retest a few skills, pass skill paths to the marketplace selection:
   `mise exec -- pnpm eval:trigger:marketplace -- plugins/<plugin>/skills/<skill> [more paths] --agent both`
   runs only the named skills' fixtures. A selected skill whose plugin ships in only one agent's
   catalog is skipped with a notice on the other agent's lane. For one skill, use the plain
   single-skill run; `--case <id>` and `--fixture <path>` narrow it to one flaky case.

   Trigger cases run with bounded parallelism by default. When the target fixture needs a slower or
   faster run than the default concurrency of 3, use `--concurrency <n>`. The default per-case
   timeout is 60 seconds because trigger evals measure whether the skill is invoked, not whether the
   requested workflow completes.

   Evals pin the default models to the ones this repository's skills are used with day to day:
   `gpt-5.6-sol` for Codex and `opus` for Claude Code, both at `medium` reasoning effort. Trigger
   boundaries are model-specific, so the defaults measure real invocation behavior instead of a
   smaller-model proxy. Use `--model` and `--effort` to spot-check other models or match a different
   working setup.

5. Read the report and failed case outputs under `.local/skill-evals/trigger/`.
6. For false negatives, make the description more explicit about the missing user intent.
7. For false positives, narrow the description with clearer ownership boundaries or exclusions. When
   only Claude Code needs different tuning, prefer adding or adjusting the Claude-only `when_to_use`
   frontmatter key over forking the shared `description`: Claude appends `when_to_use` to the
   description in its skill listing (combined text truncated at 1,536 characters), while Codex
   ignores the key entirely.
8. When a repo-local target overlaps a marketplace skill — a `wrong-skill` result in either
   direction — fix the repo-local description. Marketplace descriptions serve every installation;
   edit one only when the overlap would also misfire in a session without the repo-local skills.
9. Rerun the same eval after edits. After a description edit, also rerun the fixtures of every skill
   named in `wrong-skill` results:
   `mise exec -- pnpm eval:trigger:marketplace -- <skill-path> [more paths] --agent both`.
10. Run repository validation for changed files:

    ```bash
    mise exec -- pnpm lint:plugins
    mise exec -- pnpm format:check
    mise exec -- pnpm lint
    mise exec -- pnpm typecheck
    ```

## Harness notes

- The runner writes reports and Codex homes under `.local/skill-evals/`, and creates staged
  workspaces outside the repository so only deliberately staged skills are loadable — the parent
  checkout's live skills never leak into the trigger signal.
- Cases with `workspace_files` run in a case-specific copy of the isolated workspace, then write the
  listed safe relative paths before invoking Codex.
- The committed `description` remains the trigger surface under test.
- The runner appends eval-only instructions to the staged skill copies telling the model to output a
  canary token and stop immediately after invocation. This keeps positive cases focused on trigger
  classification instead of workflow completion.
- The runner also stops the agent CLI as soon as it observes the invocation signal, so positive
  cases do not need to finish the requested workflow.
- Negative cases stop early too: once five substantive items (agent messages, command executions —
  not reasoning) complete without an invocation signal, the run is stopped and classified as a clean
  skip, because the trigger decision happens at the front of the turn.
- For plugin skills on Codex, the canary section is body-only so the frontmatter description under
  test stays byte-identical to the committed skill; invocation is classified when the assistant
  outputs the token. Older Codex CLIs' `codex.skill.injected` stderr telemetry remains a secondary
  signal.
- Every staged skill keeps its real invocation policy, and each implicitly invokable staged plugin
  skill gets its own canary, so invoking the wrong skill is a distinct, attributable observation. A
  `wrong-skill <plugin>:<skill>` result fails an invoke case — even when the target also fires,
  because simultaneous invocation is itself trigger-contract overlap — and is surfaced on passing
  skip cases too, because either direction exposes overlap between loaded skills.
- For a repo-local target on Codex, the runner additionally rewrites the copied description to
  reference the canary because Codex surfaces repo-local skills without any other observable signal.
  Sibling repo-local skills stage pristine and carry no canary — rewriting their descriptions would
  perturb the competition under test — so a sibling repo-local invocation is not attributable on the
  Codex lane; use the Claude lane's Skill tool events to attribute repo-local overlap.
- On Claude Code, the runner launches `claude -p` with a read-only tool surface and classifies
  invocation from Skill tool events in the stream-json output. Plugin skills load from the staged
  plugin copy via `--plugin-dir`; repo-local skills load as pristine project skills from the staged
  `.claude/skills/` copy, so the committed description is tested unmodified on Claude.
- Claude workspaces stage project-only `.claude/settings.json` with `disableBundledSkills: true` so
  bundled skills such as `code-review` do not compete with the target. The runner verifies the
  isolation at runtime: each Claude case checks the init event's `skills` list against the staged
  set (plus the exempt `doctor` skill) and reports an environmental failure when unstaged skills
  leak in, because a leaked skill can steal or provoke an invocation in either direction.
- Staging is lane-specific: only the evaluated agent's config surfaces are written into the
  workspace (`.claude/` for Claude, `.agents/` for Codex), so the other agent's files never pollute
  the workspace under test.
- Case pass/fail is based on matching the expected invoke or skip classification. Exec errors and
  timeouts remain in the report because trigger evals do not validate workflow completion.
- Skip verdicts record how the run ended: natural completion, the decision-item budget, or the case
  timeout. Timeout skips are annotated as weak signals because the model might have invoked after
  the cutoff; treat a fixture that repeatedly skips only via timeout as unresolved, not passing.
- Run trigger evals from an unsandboxed context. The per-case CLI subprocesses apply their own OS
  sandbox and need network and home-directory access, so driving the harness from inside a sandbox
  (a sandboxed Codex session, a sandboxed Bash tool call) kills every case before it executes —
  macOS refuses to nest a second Seatbelt sandbox. The runner reports such cases as ERROR with an
  environmental-failure note instead of counting the dead run as a skip.
- The runner removes copied `auth.json` from the temporary Codex home after the run.

## Boundaries

- Do not change skill behavior or body instructions unless the trigger boundary requires it.
- Do not make the script edit descriptions automatically.
- Do not add trigger evals to `mise exec -- pnpm check`; this is a development workflow, not a
  routine gate.
