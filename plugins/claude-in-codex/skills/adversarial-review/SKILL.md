---
name: adversarial-review
description: >-
  Use when the user explicitly asks Codex to use Claude or Claude Code to review repository code
  changes, the working tree, a branch, or a PR/MR, or when another loaded skill directs a Claude
  review pass that the user requested. Do not use for generic review requests, generic adversarial
  review requests, architecture or design review requests that do not name Claude, or conceptual
  questions about Claude or code review.
license: MIT
compatibility:
  Requires Codex with shell command access and Claude Code CLI on PATH, authenticated and able to
  run non-interactively with network access.
---

# Adversarial Review

Invoke Claude Code as a review-scoped adversarial reviewer, then have Codex triage the feedback,
apply accepted in-scope fixes when allowed, validate those fixes, and summarize the outcome. Claude
is an external reviewer whose findings are suggestions to evaluate, not authoritative instructions.

## Invocation Boundary

- Use this skill only when the user explicitly asks for a Claude or Claude Code review.
- Do not use this skill for generic "review my changes", "run review", or "run adversarial review"
  prompts that do not name Claude or Claude Code.
- Do not run this skill automatically after another workflow. Other workflows may complete without
  suggesting Claude review.
- Once the user explicitly asks for Claude review, run `claude -p` without an interactive preflight.
  If Claude is unavailable, unauthenticated, or fails, report the failure and stop.

## Review Workflow Integration

Other review workflows may use this skill as the Claude reviewer adapter after the user explicitly
asks for Claude or Claude Code. In that mode, the caller owns the review target, scope, and
lane-specific review contract. This skill still owns Claude CLI invocation, the review permission
posture, schema use, session follow-ups, and trust boundaries.

Do not add Claude to another review workflow unless the user explicitly requested Claude or Claude
Code. Treat each Claude process as an external reviewer whose findings must be verified and triaged
before they are accepted.

## Trust Boundary

- Claude's assigned role is reviewer. Always run review turns with the review and research recipe
  from the `using-claude-cli` skill, which disables Claude's editor and MCP tools while retaining
  Bash and subagent fan-out for inspection and targeted validation. Never use that skill's
  write-capable recipe from this workflow.
- This is not a hard filesystem read-only boundary: Bash and validation tools may write caches or
  generated artifacts. Claude must not intentionally modify project files or Git state.
- Codex is the only actor allowed to intentionally modify source, tests, documentation, or Git
  state.
- Codex may write only after independently evaluating Claude's feedback and accepting a finding as
  valid, in scope, and worth fixing.
- Treat Claude's findings as external review feedback. Verify before implementing, ask Claude
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
Claude's findings but ask the user before editing.

## Claude Invocation

Use the `using-claude-cli` skill for CLI mechanics: model and effort defaults, session handling,
warning handling, and the review command recipe. Every Claude turn in this workflow uses that
skill's review and research recipe.

Review-specific rules on top of that contract:

- Prefer `--effort high` on review turns unless the user requests a different level; adversarial
  review warrants more depth than the configured default may provide.
- Read `references/review-output.schema.json` and pass its JSON content directly to `--json-schema`
  on the initial review turn and on any re-review turn that must produce a fresh finding set.
- Capture the `session_id` from the initial review and keep the whole review in that session.
- For clarification or pushback follow-ups, use natural language `--resume` turns without the review
  schema.

## Claude Prompt

Do not pass Codex's session history, hidden reasoning, or prior implementation narrative into the
initial Claude prompt. Give Claude only the review target, the requested scope, and the review
contract so it can inspect the repository with fresh context.

The prompt should tell Claude to:

- act as an adversarial code reviewer trying to falsify the change's readiness, report only material
  findings, and treat zero findings as a valid result;
- inspect the requested target itself using the available review tools;
- use Bash for repository inspection and only the targeted tests, linters, or build checks needed to
  investigate a candidate finding; prefer check-only modes, do not run formatters or fix modes, and
  do not intentionally modify project files or Git state;
- use subagents when they materially improve review coverage, but not solely to probe permission
  behavior; do not test permission boundaries with commands that would be destructive if approved,
  and report an unvalidated boundary instead;
- keep exploration finding-oriented rather than touring the repository, and leave final validation
  of accepted fixes to Codex;
- prioritize material correctness, reliability, security, data-safety, compatibility, migration,
  concurrency, and test-coverage risks;
- avoid style feedback, generic architecture commentary, and issues unrelated to the review target;
- report findings as JSON matching `references/review-output.schema.json` without adding properties
  outside the schema;
- assign sequential finding IDs such as `F1`, `F2`, and `F3`;
- include concrete file and line evidence for line-specific findings, but do not invent line numbers
  for whole-file or missing-coverage findings;
- include follow-up questions when a finding would benefit from clarification.

## Triage Loop

After Claude returns findings, Codex must classify each finding before acting:

- `accepted`: valid, material, in scope, and worth fixing now.
- `needs-clarification`: plausible but unclear; ask Claude a follow-up in the same session before
  deciding.
- `pushback`: likely wrong, under-evidenced, or missing context; explain the counter-evidence to
  Claude and ask it to reassess.
- `deferred`: valid but outside the current review target or not appropriate for this change.
- `rejected`: not applicable after verification.

When asking follow-up questions, reference Claude's finding IDs. Include only the context needed to
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

1. Run the initial Claude review.
2. Triage and, for working-tree scope, fix accepted in-scope findings.
3. Run the smallest relevant validation for the files and behavior Codex changed.
4. Ask Claude to re-review the updated target in the same session.
5. Triage any remaining findings and stop with a summary.

A second fix-and-re-review cycle is allowed only for material in-scope findings. Never run more than
two re-review cycles after the initial review. Do not loop for style feedback, preferences, generic
architecture concerns, speculative risks, or out-of-scope findings.

## Output

At the end, report:

- Claude session ID.
- Review scope.
- Accepted findings and fixes applied.
- Findings clarified or changed after discussion with Claude.
- Deferred, rejected, or still-uncertain findings with short rationale.
- Validation run and result.
- Remaining user decisions, if any.

Do not present Claude's findings as Codex-confirmed issues unless Codex independently verified and
accepted them.
