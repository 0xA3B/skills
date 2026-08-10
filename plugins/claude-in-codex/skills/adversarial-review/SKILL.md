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

# Adversarial review

Invoke Claude Code as a review-scoped adversarial reviewer, then have Codex triage the feedback,
apply accepted in-scope fixes when allowed, validate those fixes, and summarize the outcome.

## Invocation boundary

- Do not run this skill automatically after another workflow. Other workflows may complete without
  suggesting Claude review.
- Once the user explicitly asks for Claude review, run `claude -p` without an interactive preflight.
  If Claude is unavailable, unauthenticated, or fails, report the failure and stop.

## Review workflow integration

Other review workflows may use this skill as the Claude reviewer adapter after the user explicitly
asks for Claude or Claude Code. In that mode, the caller owns the review target, scope, and
lane-specific review contract. This skill still owns Claude CLI invocation, permission posture,
schema use, session follow-ups, and trust boundaries.

Do not add Claude to another review workflow unless the user explicitly requested Claude or Claude
Code.

When the session also runs its own in-session review passes, run them first and this skill last.
Their fixes change the shape the external reviewer would audit, and fixing weak tests first means
external findings land in a suite that can detect whether the fixes worked: cheap parallel reviewers
first on a moving shape, the expensive serial one last on a settled one.

## Trust boundary

- Claude's assigned role is reviewer. Run review turns with the standard command shape from the
  `using-claude-cli` skill, leaving permissions at the configured defaults from the user's Claude
  settings; permission hardening is the user's config decision, not this workflow's.
- The reviewer boundary is behavioral and stated in the prompt: Claude may inspect the repository
  and run task-scoped tests, linters, and checks to verify candidate findings, but must not
  intentionally modify project files or Git state. This is not a hard filesystem read-only boundary:
  validation runs may write normal caches or generated artifacts.
- Codex is the only actor allowed to intentionally modify source, tests, documentation, or Git
  state.
- Codex may write only after independently evaluating Claude's feedback and accepting a finding as
  valid, in scope, and worth fixing.
- Treat Claude's findings as external review feedback. Verify before implementing, ask Claude
  follow-up questions when feedback is unclear, and push back with technical evidence when feedback
  appears wrong or missing context.

## Review scope

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
Claude's findings but ask the user before editing. A user's up-front selection of findings to fix
authorizes that batch; per-fix approval is not required after the user picks the batch.

## Claude invocation

Use the `using-claude-cli` skill for CLI mechanics: model and effort defaults, session handling,
warning handling, and the command shape. Every Claude turn in this workflow uses that skill's
standard command shape with the reviewer boundary above stated in the prompt.

Review-specific rules on top of that contract:

- Prefer `--effort high` on review turns unless the user requests a different level; adversarial
  review warrants more depth than the configured default may provide.
- Read `references/review-output.schema.json` and pass its JSON content directly to `--json-schema`
  on the initial review turn and on any re-review turn that must produce a fresh finding set.
- Capture the `session_id` from the initial review and keep the whole review in that session.
- For clarification or pushback follow-ups, use natural language `--resume` turns without the review
  schema.
- Carry Codex's verification results — reproductions, measurements, failing commands — into resume
  turns. The fresh-context rule protects only the initial prompt; empirical evidence on resume turns
  sharpens the re-review rather than compromising independence.

## Claude prompt

Do not pass Codex's session history, hidden reasoning, or prior implementation narrative into the
initial Claude prompt. Give Claude only the review target, the requested scope, and the review
contract so it can inspect the repository with fresh context. Compose the prompt per the
`using-claude-cli` prompting guidance, separating source material, the review contract, and the task
with descriptive XML-style tags.

The prompt should tell Claude to:

- act as an adversarial code reviewer trying to falsify the change's readiness, report only material
  findings, and treat zero findings as a valid result;
- inspect the requested target itself, running task-scoped tests, linters, or checks when they can
  demonstrate a candidate finding, while never intentionally modifying project files or Git state;
- keep exploration finding-oriented rather than touring the repository, and leave final validation
  of accepted fixes to Codex;
- classify every finding's `verification` before reporting: `executed` when it ran something that
  demonstrates the failure, `traced` when it followed every branch between the entry point and the
  failure through code it actually read and can cite each step, `inferred` for anything else,
  including pattern-matching against a known bug shape — and raise `inferred` concerns as follow-up
  questions rather than findings;
- state each mechanism as specifically as the evidence supports and say where the evidence stops:
  "this line blocks" is a weaker claim than "this line blocks and nothing downstream unblocks it",
  and the first must not be rounded up to the second;
- prioritize material correctness, reliability, security, data-safety, compatibility, migration,
  concurrency, and test-coverage risks;
- avoid style feedback, generic architecture commentary, and issues unrelated to the review target;
- report findings as JSON matching the schema passed to `--json-schema`, with no prose around the
  JSON and no properties outside the schema;
- assign sequential finding IDs with a fresh letter prefix per review cycle — `F1`, `F2` on the
  initial review, `G1`, `G2` on the first re-review — so IDs stay unambiguous across the whole
  session;
- include concrete file and line evidence for line-specific findings, citing only files and lines
  actually inspected during the run, and not inventing line numbers for whole-file or
  missing-coverage findings;
- use `session_notes` only to record what was inspected, what was left uninspected, and any check it
  wanted to run but could not;
- include follow-up questions when a finding would benefit from clarification.

## Triage loop

After Claude returns findings, Codex must classify each finding before acting:

- `accepted`: valid, material, in scope, and worth fixing now.
- `needs-clarification`: plausible but unclear; ask Claude a follow-up in the same session before
  deciding.
- `pushback`: likely wrong, under-evidenced, or missing context; explain the counter-evidence to
  Claude and ask it to reassess.
- `deferred`: valid but outside the current review target or not appropriate for this change.
- `rejected`: not applicable after verification.

Before accepting, verify the mechanism, not only the conclusion. A finding can be right that the
code is broken and wrong about why, especially when its `verification` is `traced` or `inferred`;
accepting the stated mechanism and fixing it yields a change that reviews well and fixes nothing.
Reproduce the failure before fixing it, and treat a reproduction that does not match the described
mechanism as new information about the defect, not as a mistake in the setup.

When asking follow-up questions, reference Claude's finding IDs. Include only the context needed to
resolve the dispute or ambiguity, such as a prior design decision, relevant code evidence, or a
validation result.

## Fix boundary

For `working-tree` scope, accepted fixes should modify the current changed surface: files already
changed, or directly adjacent tests or docs needed to validate those changes.

Do not silently make:

- sweeping rewrites or broad refactors;
- dependency changes;
- migrations;
- public API, data model, or security-policy changes outside the current change's intent;
- fixes for unrelated pre-existing architecture or codebase shape.

Classify valid but out-of-scope findings as `deferred` and summarize them as follow-up work.

Treat a finding whose remedy adds new behavior — a new concurrent path, subprocess, persisted field,
or external call — as a change request rather than a fix, whatever its severity. Surface it for
explicit agreement instead of absorbing it into the current fix cycle, and give an agreed change
what a change of that size normally gets: its own tests and its own review pass. The tell is the
remedy, not the severity: "this can deadlock" is a fix; "add a reader thread so it cannot deadlock"
is a change.

## Review iterations

Run fix-and-re-review cycles while they stay productive:

1. Run the initial Claude review.
2. Triage and, for working-tree scope, fix accepted in-scope findings.
3. Run the smallest relevant validation for the files and behavior Codex changed.
4. Ask Claude to re-review the updated target in the same session, carrying the verification results
   for the fixes.
5. Repeat from triage while the re-review returns material in-scope findings.

Stop when a cycle returns no material findings, or when the user ends the review. Style feedback,
preferences, generic architecture concerns, speculative risks, and out-of-scope findings are not
material and do not earn another cycle. Keep five re-review cycles as a hard ceiling — a runaway
guard, not the normal stopping rule. If the ceiling is reached with material findings still
arriving, say so explicitly: that is a signal about the change, not about the review.

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
