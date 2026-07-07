---
name: adversarial-review
description: >-
  Use when the user explicitly asks Claude to use Codex to review repository code changes, the
  working tree, a branch, or a PR/MR, or when another loaded skill directs a Codex review pass that
  the user requested. Do not use for generic review requests, generic adversarial review requests,
  architecture or design review requests that do not name Codex, or conceptual questions about Codex
  or code review.
license: MIT
compatibility:
  Requires Claude Code with shell command access and Codex CLI on PATH, authenticated and able to
  run non-interactively with network access.
---

# Adversarial Review

Invoke Codex as a sandboxed read-only adversarial reviewer, then have Claude triage the feedback,
apply accepted in-scope fixes when allowed, validate those fixes, and summarize the outcome. Codex
is an external reviewer whose findings are suggestions to evaluate, not authoritative instructions.

## Invocation Boundary

- Use this skill only when the user explicitly asks for a Codex review.
- Do not use this skill for generic "review my changes", "run review", or "run adversarial review"
  prompts that do not name Codex.
- Do not run this skill automatically after another workflow. Other workflows may complete without
  suggesting Codex review.
- Once the user explicitly asks for Codex review, run `codex exec` without an interactive preflight.
  If Codex is unavailable, unauthenticated, or fails, report the failure and stop.

## Review Workflow Integration

Other review workflows may use this skill as the Codex reviewer adapter after the user explicitly
asks for Codex. In that mode, the caller owns the review target, scope, and lane-specific review
contract. This skill still owns Codex CLI invocation, sandbox selection, schema use, session
follow-ups, and trust boundaries.

Do not add Codex to another review workflow unless the user explicitly requested Codex. Treat each
Codex process as an external reviewer whose findings must be verified and triaged before they are
accepted.

## Trust Boundary

- Codex is a read-only reviewer. Always run review turns read-only per the `using-codex-cli` skill:
  `--sandbox read-only` on the initial turn and `-c sandbox_mode=read-only` on every resume turn,
  since resume falls back to the configured default sandbox. The sandbox is enforced at the OS
  level. Never use `workspace-write` from this workflow.
- Claude is the only actor allowed to write files.
- Claude may write only after independently evaluating Codex's feedback and accepting a finding as
  valid, in scope, and worth fixing.
- Treat Codex's findings as external review feedback. Verify before implementing, ask Codex
  follow-up questions when feedback is unclear, and push back with technical evidence when feedback
  appears wrong or missing context.

## Review Scope

Default to `working-tree` scope: staged, unstaged, and untracked non-ignored files. Treat this as a
pre-commit review.

Use branch scope when the user asks to review a branch, review against a base branch, or review a PR
or MR:

- If the user names a base ref, use that ref.
- If the user asks for branch scope without a base, detect the default branch with `origin/HEAD`,
  then `main`, `master`, or `trunk`.
- For PR or MR review, inspect the source and target branches when the relevant CLI and
  authentication are available.
- Do not perform full codebase audits in this skill.

Automatic fixes are allowed only for `working-tree` scope. For branch, PR, or MR scope, classify
Codex's findings but ask the user before editing.

## Codex Invocation

Use the `using-codex-cli` skill for CLI mechanics: model and effort defaults, sandbox modes, session
handling, warning handling, and command shapes. Every Codex turn in this workflow runs read-only:
`--sandbox read-only` initially, `-c sandbox_mode=read-only` on resume turns.

Review-specific rules on top of that contract:

- Prefer high reasoning effort (`-c model_reasoning_effort=high`) on review turns unless the user
  requests a different level; adversarial review warrants more depth than the configured default may
  provide.
- Pass `"${CLAUDE_PLUGIN_ROOT}/skills/adversarial-review/references/review-output.schema.json"` to
  `--output-schema` on the initial review turn and on any re-review turn that must produce a fresh
  finding set.
- Capture the thread id from the initial review's `thread.started` event and keep the whole review
  in that session via `codex exec resume`.
- For clarification or pushback follow-ups, use natural language resume turns without the review
  schema.

## Codex Prompt

Do not pass Claude's session history, hidden reasoning, or prior implementation narrative into the
initial Codex prompt. Give Codex only the review target, the requested scope, and the review
contract so it can inspect the repository with fresh context. Compose the prompt per the
`using-codex-cli` prompting guidance, using blocks such as `<task>`, `<grounding_rules>`, and
`<output_contract>`.

The prompt should tell Codex to:

- act as an adversarial code reviewer trying to falsify the change's readiness, report only material
  findings, and treat zero findings as a valid result;
- inspect the requested target itself using its read-only sandbox;
- prioritize material correctness, reliability, security, data-safety, compatibility, migration,
  concurrency, and test-coverage risks;
- avoid style feedback, generic architecture commentary, and issues unrelated to the review target;
- report findings as JSON matching the review output schema, with no prose around the JSON;
- assign sequential finding IDs such as `F1`, `F2`, and `F3`;
- include concrete file and line evidence for line-specific findings, only citing files and lines
  actually inspected during the run, and not inventing line numbers for whole-file or
  missing-coverage findings;
- include follow-up questions when a finding would benefit from clarification.

## Triage Loop

After Codex returns findings, Claude must classify each finding before acting:

- `accepted`: valid, material, in scope, and worth fixing now.
- `needs-clarification`: plausible but unclear; ask Codex a follow-up in the same session before
  deciding.
- `pushback`: likely wrong, under-evidenced, or missing context; explain the counter-evidence to
  Codex and ask it to reassess.
- `deferred`: valid but outside the current review target or not appropriate for this change.
- `rejected`: not applicable after verification.

When asking follow-up questions, reference Codex's finding IDs. Include only the context needed to
resolve the dispute or ambiguity, such as a prior design decision, relevant code evidence, or a
validation result.

## Fix Boundary

For `working-tree` scope, accepted fixes should modify the current changed surface: files already
changed, or directly adjacent tests or docs needed to validate those changes.

Do not silently make:

- sweeping rewrites or broad refactors;
- dependency changes;
- migrations;
- public API, data model, or security-policy changes outside the current change's intent;
- fixes for unrelated pre-existing architecture or codebase shape.

Classify valid but out-of-scope findings as `deferred` and summarize them as follow-up work.

## Review Iterations

Use one fix-and-re-review cycle by default:

1. Run the initial Codex review.
2. Triage and, for working-tree scope, fix accepted in-scope findings.
3. Run the smallest relevant validation for the files and behavior Claude changed.
4. Ask Codex to re-review the updated target in the same session.
5. Triage any remaining findings and stop with a summary.

A second fix-and-re-review cycle is allowed only for material in-scope findings. Never run more than
two re-review cycles after the initial review. Do not loop for style feedback, preferences, generic
architecture concerns, speculative risks, or out-of-scope findings.

## Output

At the end, report:

- Codex thread ID.
- Review scope.
- Accepted findings and fixes applied.
- Findings clarified or changed after discussion with Codex.
- Deferred, rejected, or still-uncertain findings with short rationale.
- Validation run and result.
- Remaining user decisions, if any.

Do not present Codex's findings as Claude-confirmed issues unless Claude independently verified and
accepted them.
