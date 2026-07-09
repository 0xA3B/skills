---
name: using-codex-cli
description: >-
  Internal contract for invoking the Codex CLI non-interactively. Use when another codex-in-claude
  skill or the codex proxy agent needs to run codex exec for review, delegation, session follow-ups,
  or structured output. Do not use for conceptual questions about Codex.
license: MIT
user-invocable: false
compatibility:
  Requires Codex CLI on PATH, authenticated and able to run non-interactively with network access.
---

# Using the Codex CLI

This skill owns the mechanics of running Codex non-interactively: command shapes, sandbox modes,
sessions, structured output, and prompting guidance. The caller owns the task contract: what Codex
is asked to do, the scope, and how its output is used.

## CLI Basics

- Use `codex` from `PATH`; do not hard-code a machine-specific absolute path.
- Run `codex` outside any calling sandbox, such as Claude Code's Bash sandbox: it needs network
  access and `~/.codex` writes for session state, and its own OS-level sandbox is the enforcement
  boundary.
- Leave the model at the configured default. Add `-m <model>` only when the user explicitly requests
  a specific model.
- Leave reasoning effort at the default. Set `-c model_reasoning_effort=<level>` (`low`, `medium`,
  `high`, or `xhigh`) only when the user requests it or the task clearly warrants it; tighten the
  prompt before raising effort.
- Higher effort levels can take several minutes, even for small targets. Be patient and let Codex
  finish unless the process is clearly hung or the user asks to stop.
- Do not treat non-fatal Codex CLI warnings as failures. Continue when Codex still produces a usable
  result, adjust later commands if the warning identifies a bad option, and surface the warning in
  the final summary when it may affect future maintenance.
- If Codex is unavailable, unauthenticated, or fails, report the failure and stop; do not retry the
  same command blindly.

## Sandbox Modes

Codex enforces its sandbox at the OS level, so permissions are set by flag or config, not by
instruction:

- Pin `--sandbox read-only` for review, diagnosis, and research turns that must never modify the
  repository. Read-only is an intentional downgrade, so set it explicitly instead of relying on the
  configured default.
- For implementation, fixes, and other write-intent tasks, leave the sandbox at the configured
  default from the user's Codex config. Pass `--sandbox` only when the user requests a specific
  mode.
- Treat a sandbox or permission denial as a failure to report, not a boundary to work around: the
  fix is the user adjusting their Codex config or naming a mode, not a broader flag.
- Never use `--sandbox danger-full-access` or `--dangerously-bypass-approvals-and-sandbox`.

## Sessions and Output

- Add `--json` to stream machine-readable JSONL events. Capture the thread id from the
  `thread.started` event (`{"type":"thread.started","thread_id":"..."}`) and preserve it for
  follow-up turns.
- Add `--output-last-message <file>` to write Codex's final message to a file; read the file for the
  result instead of scraping the event stream.
- For structured results, write a JSON Schema to a file and pass its path to
  `--output-schema <file>`. Apply a schema only to turns that must produce the structured artifact;
  use natural language for conversational follow-ups in the same session.
- Resume a session with `codex exec resume "$THREAD_ID" "$PROMPT"` (same output flags apply). Use
  `codex exec resume --last` only when resuming the most recent Codex session is unambiguous.
- Resumed turns do not keep an explicitly passed sandbox mode: `codex exec resume` has no
  `--sandbox` flag and falls back to the configured default (verified on codex-cli 0.142.5). Turns
  that already ran on the configured default resume consistently, but when a turn pinned a mode such
  as read-only, re-state it on every resume turn with `-c sandbox_mode=<mode>`.
- Redirect stdin from `/dev/null`. When stdin is a non-TTY pipe, `codex exec` reads it as additional
  prompt input and hangs until the pipe closes, which never happens in most harnesses.
- On resumed turns, send only the delta instruction instead of restating the whole prompt, unless
  the direction changed materially.

Initial-run shape, shown pinning read-only:

```bash
codex exec "$PROMPT" \
  --sandbox read-only \
  --json \
  --output-last-message "$RESULT_FILE" \
  < /dev/null
```

Follow-up shape, re-stating the pinned mode:

```bash
codex exec resume "$THREAD_ID" "$FOLLOW_UP_PROMPT" \
  -c sandbox_mode=read-only \
  --json \
  --output-last-message "$RESULT_FILE" \
  < /dev/null
```

## Prompting Codex

Codex responds best to a compact, bounded task contract. Give it enough context to inspect the right
surface, then let it choose the path unless the method is part of the requirement.

- Lead with the outcome: define the target result, success criteria, scope, and constraints.
- Name relevant files, commands, errors, and acceptance criteria. Do not paste large amounts of
  repository context that Codex can inspect directly.
- Keep simple prompts simple. For complex prompts, use concise headings or a few stable blocks such
  as `<task>`, `<constraints>`, `<output_contract>`, and `<verification_loop>`; XML is optional, not
  a default requirement.
- Tell Codex to handle the task end-to-end when the request is clear enough to attempt. It should
  make safe, reversible assumptions within scope, but stop and report the decision needed when a
  choice would materially change requirements or expand authority.
- Give Codex a runnable verification check when possible. Ask it to run the check, iterate on
  failures within scope, and return the command and result or explain the blocker.
- Define what the final response must contain and the desired level of detail. Require exact section
  order or schema-only output only when a machine consumer needs it; for structured output, forbid
  prose and markdown fences around the result.
- Add grounding rules for review and research tasks: inspect the relevant sources before making
  claims, cite only files and lines actually inspected, and never fabricate citations or line
  numbers for absent behavior.
- Reserve absolute words like "always" and "never" for true invariants; give decision rules for
  judgment calls.
- One clear task per run. Split unrelated asks into separate runs, break complex work into focused
  stages when that makes verification easier, and send only deltas on resumed turns.
- Tighten the task contract before raising reasoning effort.
