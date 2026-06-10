---
name: adversarial-review
description: >-
  Use when the user explicitly asks Codex to use Claude or Claude Code to review repository code
  changes, the working tree, a branch, or a PR/MR. Do not use for generic review requests, generic
  adversarial review requests, or conceptual questions about Claude or code review.
license: MIT
compatibility:
  Requires Codex with shell command access and Claude Code CLI on PATH, authenticated and able to
  run non-interactively with network access.
---

# Adversarial Review

Invoke Claude Code as a read-only adversarial reviewer, then have Codex triage the feedback, apply
accepted in-scope fixes when allowed, validate those fixes, and summarize the outcome. Claude is an
external reviewer whose findings are suggestions to evaluate, not authoritative instructions.

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
lane-specific review contract. This skill still owns Claude CLI invocation, read-only permissions,
schema use, session follow-ups, and trust boundaries.

Do not add Claude to another review workflow unless the user explicitly requested Claude or Claude
Code. Treat each Claude process as an external reviewer whose findings must be verified and triaged
before they are accepted.

## Trust Boundary

- Claude is a read-only reviewer by instruction. The command grants Bash for broad exploration, so
  Codex must tell Claude to use Bash only for read-only inspection and never to modify files, git
  state, or generated output.
- This workflow assumes the current working tree is recoverable if a command misfires. If that is
  not true, commit, stash, or otherwise preserve important local work before running Claude review.
- Codex is the only actor allowed to write files.
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

Use `claude` from `PATH`; do not hard-code a machine-specific absolute path. Default to Opus with
extra-high effort unless the user explicitly requests another model or effort.

Opus with extra-high effort can take several minutes, even for small review targets. Be patient and
let Claude finish unless the process is clearly hung or the user asks to stop.

Do not treat non-fatal Claude CLI warnings as review failures. Continue when Claude still produces a
usable result, adjust later Claude commands if the warning identifies a bad option, and include the
warning in the final summary when it may affect future skill maintenance.

Read `references/review-output.schema.json` and pass its JSON content to `--json-schema`.

Use this command shape for the initial review:

```bash
claude -p "$PROMPT" \
  --model "${MODEL:-opus}" \
  --effort "${EFFORT:-xhigh}" \
  --permission-mode dontAsk \
  --tools "Read,Glob,Grep,Bash" \
  --disallowedTools "Edit,Write,NotebookEdit" \
  --output-format json \
  --json-schema "$REVIEW_SCHEMA_JSON"
```

Do not use `--no-session-persistence`. Capture and preserve the `session_id` from Claude's JSON
output.

For clarification or pushback follow-ups, use natural language in the same Claude session. Do not
apply the review schema to conversational turns:

```bash
claude -p "$FOLLOW_UP_PROMPT" --resume "$SESSION_ID" \
  --model "${MODEL:-opus}" \
  --effort "${EFFORT:-xhigh}" \
  --permission-mode dontAsk \
  --tools "Read,Glob,Grep,Bash" \
  --disallowedTools "Edit,Write,NotebookEdit" \
  --output-format json
```

For re-review turns that ask Claude to produce a fresh finding set, use the schema again:

```bash
claude -p "$REVIEW_PROMPT" --resume "$SESSION_ID" \
  --model "${MODEL:-opus}" \
  --effort "${EFFORT:-xhigh}" \
  --permission-mode dontAsk \
  --tools "Read,Glob,Grep,Bash" \
  --disallowedTools "Edit,Write,NotebookEdit" \
  --output-format json \
  --json-schema "$REVIEW_SCHEMA_JSON"
```

Use `--continue` only when resuming the most recent Claude session is unambiguous.

## Claude Prompt

Do not pass Codex's session history, hidden reasoning, or prior implementation narrative into the
initial Claude prompt. Give Claude only the review target, the requested scope, and the review
contract so it can inspect the repository with fresh context.

The prompt should tell Claude to:

- act as an adversarial code reviewer trying to find reasons the change should not ship yet;
- inspect the requested target itself using read-only tools;
- use Bash only for read-only inspection; do not modify files, git state, or generated output, and
  do not run formatters;
- prioritize material correctness, reliability, security, data-safety, compatibility, migration,
  concurrency, and test-coverage risks;
- avoid style feedback, generic architecture commentary, and issues unrelated to the review target;
- report findings as JSON matching `references/review-output.schema.json`;
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
