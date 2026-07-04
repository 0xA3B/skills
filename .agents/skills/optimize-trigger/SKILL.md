---
name: optimize-trigger
description: >-
  Evaluate and improve automatic invocation behavior for one repo plugin skill by running committed
  trigger fixtures through isolated Codex and Claude Code CLI harnesses. Use when the user asks to
  optimize, tune, or evaluate when a skill is implicitly triggered.
license: MIT
---

# Optimize Trigger

Repo-local workflow for improving when a plugin skill is automatically invoked. This skill owns
fixture review, eval execution, failure interpretation, and description edits. The eval script only
runs cases and reports evidence.

## Outcome

Improve one skill's implicit trigger behavior until committed trigger fixtures pass, or report the
specific fixture, harness, or description problem that blocks progress.

Stop when trigger evals pass for the target skill, when `policy.allow_implicit_invocation: false`
makes the workflow inapplicable, or when the remaining failures require a user decision about the
skill's intended trigger boundary.

## Target Scope

- Target repo plugin skills under `plugins/<plugin>/skills/<skill>/` or repo-local skills under
  `.agents/skills/<skill>/`.
- Use this workflow only for skills with `agents/openai.yaml`
  `policy.allow_implicit_invocation: true`.
- If the target skill is manual-only, warn the user and do not optimize trigger behavior unless they
  explicitly ask for advisory review.
- Optimize trigger behavior only. Do not evaluate output quality in this workflow.

## Fixture Contract

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
   mise exec -- pnpm eval:trigger -- .agents/skills/<skill>
   ```

   The `description` is one trigger contract shared by both agents, so plugin skills should pass on
   both. Use `--agent codex` or `--agent claude` to iterate on one agent at a time. Repo-local
   skills run on Codex only because Claude Code never loads `.agents/skills/`.

   Trigger cases run with bounded parallelism by default. Use `--concurrency <n>` when the target
   fixture needs a slower or faster run than the default concurrency of 3. The default per-case
   timeout is 60 seconds because trigger evals measure whether the skill is invoked, not whether the
   requested workflow completes.

   Evals pin smaller default models for cost and reproducibility: `gpt-5.6-luna` for Codex and
   `sonnet` for Claude Code, both at `medium` reasoning effort. A description that triggers
   correctly on a smaller model usually holds on larger ones. Use `--model` and `--effort` to
   spot-check a contentious description change on a production-class model.

5. Read the report and failed case outputs under `.local/skill-evals/trigger/`.
6. For false negatives, make the description more explicit about the missing user intent.
7. For false positives, narrow the description with clearer ownership boundaries or exclusions.
8. Rerun the same eval after edits.
9. Run repository validation for changed files:

   ```bash
   mise exec -- pnpm lint:plugins
   mise exec -- pnpm format:check
   mise exec -- pnpm lint
   mise exec -- pnpm typecheck
   ```

## Harness Notes

- The runner writes reports and Codex homes under `.local/skill-evals/`, and creates isolated
  workspaces outside the repository so parent repo-local skills cannot contaminate the trigger
  signal.
- Cases with `workspace_files` run in a case-specific copy of the isolated workspace, then write the
  listed safe relative paths before invoking Codex.
- The committed `description` remains the trigger surface under test.
- For repo-local skill cases, the runner appends eval-only instructions to the copied target
  `SKILL.md` telling the model to output a per-case token and stop immediately after invocation.
  This keeps positive cases focused on trigger classification instead of workflow completion.
- The runner also stops `codex exec` as soon as it observes the invocation signal, so positive cases
  do not need to finish the requested workflow.
- For plugin skills on Codex, the runner classifies invocation from Codex CLI stderr telemetry
  containing `codex.skill.injected` for the target skill.
- For plugin skills on Claude Code, the runner launches `claude -p` against the staged plugin copy
  via `--plugin-dir` with a read-only tool surface, and classifies invocation from Skill tool events
  referencing `<plugin>:<skill>` in the stream-json output.
- For repo-local skills, Codex currently does not emit the same plugin injection telemetry; the
  runner classifies invocation only when the assistant outputs the exact eval-only token.
- Case pass/fail is based on matching the expected invoke or skip classification. Exec errors and
  timeouts remain in the report because trigger evals do not validate workflow completion.
- The runner removes copied `auth.json` from the temporary Codex home after the run.

## Boundaries

- Do not change skill behavior or body instructions unless the trigger boundary requires it.
- Do not make the script edit descriptions automatically.
- Do not add trigger evals to `mise exec -- pnpm check`; this is a development workflow, not a
  routine gate.
