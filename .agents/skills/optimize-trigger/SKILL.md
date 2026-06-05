---
name: optimize-trigger
description: >-
  Evaluate and improve automatic invocation behavior for one repo plugin skill by running committed
  trigger fixtures through an isolated Codex CLI harness. Use when the user asks to optimize, tune,
  or evaluate when a skill is implicitly triggered.
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

- Target only repo plugin skills under `codex_plugins/<plugin>/skills/<skill>/`.
- Use this workflow only for skills with `agents/openai.yaml`
  `policy.allow_implicit_invocation: true`.
- If the target skill is manual-only, warn the user and do not optimize trigger behavior unless they
  explicitly ask for advisory review.
- Optimize trigger behavior only. Do not evaluate output quality in this workflow.

## Fixture Contract

Trigger fixtures live at:

```text
codex_plugins/<plugin>/skills/<skill>/evals/triggers.yaml
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

Use positive cases for prompts that should load the skill. Use negative cases for nearby prompts
that should not load it, especially conceptual questions, adjacent workflows, or requests owned by a
different skill. Use `workspace_files` for cases where loaded repository instructions should affect
the trigger boundary, such as an `AGENTS.md` commit convention.

## Workflow

1. Inspect the target skill's `SKILL.md`, `agents/openai.yaml`, and `evals/triggers.yaml`.
2. Confirm `policy.allow_implicit_invocation: true`. If false, warn and stop.
3. Review fixture coverage before running the eval:
   - at least one clear positive case
   - at least one clear negative case
   - near-miss cases that exercise the description boundary
4. Run:

   ```bash
   mise exec -- pnpm eval:trigger -- codex_plugins/<plugin>/skills/<skill>
   ```

   Trigger cases run with bounded parallelism by default. Use `--concurrency <n>` when the target
   fixture needs a slower or faster run than the default concurrency of 3.

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

- The runner creates a temporary Codex home and local marketplace under `.local/skill-evals/`.
- Cases with `workspace_files` run in a case-specific copy of the isolated workspace, then write the
  listed safe relative paths before invoking Codex.
- The committed `description` remains the trigger surface under test.
- The runner classifies invocation from Codex CLI stderr telemetry containing `codex.skill.injected`
  for the target skill.
- The runner removes copied `auth.json` from the temporary Codex home after the run.

## Boundaries

- Do not change skill behavior or body instructions unless the trigger boundary requires it.
- Do not make the script edit descriptions automatically.
- Do not add trigger evals to `mise exec -- pnpm check`; this is a development workflow, not a
  routine gate.
