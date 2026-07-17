---
name: using-claude-cli
description: >-
  Internal contract for invoking the Claude Code CLI non-interactively. Use when another
  claude-in-codex skill or a Claude proxy subagent needs to run claude -p for review, delegation,
  session follow-ups, or structured output. Do not use for conceptual questions about Claude Code.
license: MIT
user-invocable: false
compatibility:
  Requires Claude Code CLI on PATH, authenticated and able to run non-interactively with network
  access.
---

# Using the Claude CLI

This skill owns the mechanics of running Claude Code non-interactively: command shapes, models,
effort, sessions, structured output, and permission recipes. The caller owns the task contract: what
Claude is asked to do, the scope, and how its output is used.

## CLI Basics

- Use `claude` from `PATH`; do not hard-code a machine-specific absolute path.
- Run `claude` with escalated permissions, outside the Codex sandbox: it needs network access to
  reach the Anthropic API and home-directory writes for session state, neither of which the sandbox
  grants. Claude's own sandbox, permission mode, configured permissions, and task prompt govern the
  child process; the calling Codex sandbox does not.
- Leave the model at the configured default. Add `--model` only when the user explicitly requests a
  specific model, such as asking for a Fable or Sonnet run.
- Leave reasoning effort at the configured default. Add `--effort` (`medium`, `high`, or `xhigh`)
  only when the user requests a level or the calling workflow needs more depth than the default.
- Higher effort levels can take several minutes, even for small targets. Be patient and let Claude
  finish unless the process is clearly hung or the user asks to stop.
- Do not treat non-fatal Claude CLI warnings as failures. Continue when Claude still produces a
  usable result, adjust later commands if the warning identifies a bad option, and surface the
  warning in the final summary when it may affect future maintenance.
- If Claude is unavailable, unauthenticated, or fails, report the failure and stop; do not retry the
  same command blindly.

## Sessions and Output

- Use `--output-format json` so results are machine-readable. Do not use `--no-session-persistence`;
  capture and preserve the `session_id` from Claude's JSON output.
- Resume a session with `claude -p "$PROMPT" --resume "$SESSION_ID"`. Use `--continue` only when
  resuming the most recent Claude session is unambiguous.
- For structured results, pass a JSON Schema's content to `--json-schema`. Apply a schema only to
  turns that must produce the structured artifact; use natural language for conversational
  follow-ups in the same session.
- On resumed turns, send only the delta instruction instead of restating the whole prompt, unless
  the direction changed materially.

## Review and Research Recipe

Use this shape for review, diagnosis, or research where Claude may inspect the repository and run
task-scoped checks but should not intentionally edit project files or Git state:

```bash
claude -p "$PROMPT" \
  --permission-mode auto \
  --tools "Read,Glob,Grep,Bash" \
  --disallowedTools "Edit,Write,NotebookEdit,mcp__*" \
  --output-format json
```

This is a practical review posture, not a hard filesystem read-only boundary. Disabling Claude's
editor tools removes its normal direct-edit path, while `auto` lets Claude's classifier and the
user's configured permissions evaluate Bash commands without interactive prompts. Bash can still
write, and tests, linters, or builds may create normal caches or generated artifacts. The `mcp__*`
deny matters because `--tools` restricts only built-in tools: without it, configured MCP servers
stay callable and `auto` could approve reads or writes against external systems, which is outside
the repository-review scope this recipe promises.

State the allowed actions in the prompt. Permit repository inspection and the smallest tests,
linters, or build checks needed to investigate candidate findings; prefer check-only modes when
available. Tell Claude not to run formatters, fix modes, or commands intended to change project
files or Git state. Claude may use subagents when they materially help the task. Do not use
subagents solely to probe permission behavior, and do not test permission boundaries with commands
that would be destructive if approved; report an unvalidated boundary instead. Preserve important
local work first when the working tree is not recoverable.

## Write-Capable Recipe

Use this shape when the caller intends Claude to change files, such as a delegated implementation or
fix task:

```bash
claude -p "$TASK_PROMPT" \
  --output-format json
```

- The command sets no permission flags on purpose: Claude runs with the user's configured permission
  defaults, which are treated as the intended write posture. Add `--permission-mode` only when the
  user explicitly requests one.
- Treat a permission denial as a failure to report, not a boundary to work around: it means the
  configured defaults do not cover the task's writes non-interactively, and the fix is the user
  adjusting their Claude settings or naming a permission mode. Never use
  `--dangerously-skip-permissions`; an escalated run has no outer sandbox, so Claude's permission
  system is the only boundary left.
- State the intended change scope in the prompt and validate Claude's changes after the run; a
  write-capable Claude run is a delegation, not an oracle.

## Prompting Claude

Start with the outcome, relevant context, boundaries, success criteria, and return contract. Let
Claude choose the method unless order or completeness is itself part of the requirement.

### Claude-Specific Adjustments

- Explain why a constraint matters. Claude uses motivation to make better judgment calls, so a
  sentence of intent is often more useful than extra procedure.
- Be explicit and literal. Remove stale, contradictory, redundant, or accidental absolute
  instructions because Claude may follow them instead of silently resolving the conflict.
- When sequence or completeness matters, use numbered steps. Otherwise avoid scripting Claude's
  reasoning and let it choose how to reach the outcome.
- For nuanced judgments or exact output conventions, provide a few representative and diverse
  examples. Skip examples when a direct instruction or JSON Schema already defines the result.
- For large mixed prompts, place source material first, separate context, examples, and instructions
  with descriptive XML-style tags, and put the task near the end. Keep simple prompts simple.
- Use task-specific role framing to establish perspective, not to force a conclusion. For review,
  define the materiality threshold and state that zero findings is a valid result.
- If the caller needs a summary after tool use, request it explicitly instead of assuming Claude
  will narrate each action.

### Delegated-Agent Contract

- State what done looks like, what is outside scope, and which changes or actions are allowed.
- Give Claude a runnable verification check when possible. Ask it to run the check, iterate on
  failures within scope, and return the command and result or explain the blocker.
- Require grounded evidence. Tell Claude to inspect referenced code before making claims and cite
  `file:line` when applicable, without inventing line numbers for absent behavior or missing
  coverage.
- State how to handle material ambiguity: make safe, reversible assumptions within scope, but stop
  and report the decision needed when a choice would change requirements or expand authority.
- Prefer positive instructions that describe the desired behavior and boundary. Add prohibitions for
  consequential failure modes, irreversible actions, or known temptations.
- Tighten the prompt before raising `--effort`; effort is a last-mile knob, not a fix for a vague
  task contract.
