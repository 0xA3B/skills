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

## Read-Only Recipe

Use this shape when Claude must inspect but never modify the repository, such as review, diagnosis,
or research:

```bash
claude -p "$PROMPT" \
  --permission-mode dontAsk \
  --tools "Read,Glob,Grep,Bash" \
  --disallowedTools "Edit,Write,NotebookEdit" \
  --output-format json
```

The read-only boundary is enforced by instruction, not by an OS sandbox: the command grants Bash for
broad exploration, so the prompt must tell Claude to use Bash only for read-only inspection and
never to modify files, git state, or generated output. This recipe assumes the working tree is
recoverable if a command misfires; preserve important local work first when that is not true.

## Write-Capable Recipe

Use this shape when the caller intends Claude to change files, such as a delegated implementation or
fix task:

```bash
claude -p "$TASK_PROMPT" \
  --permission-mode acceptEdits \
  --tools default \
  --output-format json
```

- `--permission-mode acceptEdits` auto-approves file edits; shell commands that would need an
  interactive permission prompt are denied in `-p` mode and the step fails instead of blocking.
- When the delegated task needs broader shell access (builds, tests, package installs) and the
  calling process is itself confined by an OS-level sandbox, such as a Codex `workspace-write`
  session, `--dangerously-skip-permissions` is acceptable because the outer sandbox still bounds the
  damage. Never use it without an external sandbox, and never use it for review tasks.
- State the intended change scope in the prompt and validate Claude's changes after the run; a
  write-capable Claude run is a delegation, not an oracle.

## Prompting Claude

Claude responds best to intent plus constraints, not step-by-step scripts. When composing prompts
for Claude runs:

- State the goal, why it matters, and what done looks like. Claude uses intent to make judgment
  calls, so a sentence of motivation beats three sentences of procedure.
- Role framing works well: "Act as an adversarial reviewer trying to find reasons this should not
  ship" reliably shifts behavior.
- Claude follows literal instructions closely. Remove stale, contradictory, or redundant
  constraints; they cause unnecessary work rather than being ignored.
- Prefer positive instructions over prohibition lists: say what to do and the boundary around it,
  then add only the prohibitions that matter.
- Use XML-style tags to separate long context from the task when the prompt is large; heavy block
  scaffolding beyond that is unnecessary for Claude.
- Demand evidence: ask for `file:line` citations, tell Claude to verify claims against the code
  before reporting them, and to say it is unsure rather than guess.
- Set an explicit scope boundary and stopping condition. Claude errs toward doing more, so state
  what must not change and when to stop.
- Tighten the prompt before raising `--effort`; effort is a last-mile knob, not a fix for a vague
  prompt.

## Claude as a Codex Subagent

Codex plugins cannot package subagent definitions, so this skill ships a copyable one instead.
`references/claude-agent.toml` defines a general-purpose Claude proxy subagent for Codex. To install
it, copy the file to `.codex/agents/claude.toml` in a project (or `~/.codex/agents/` for all
projects). Once installed, Codex can spawn Claude as a named subagent for delegated tasks.
