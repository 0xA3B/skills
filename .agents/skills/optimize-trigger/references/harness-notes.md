# Harness notes

How the trigger eval runner stages skills, classifies an invocation, and ends a case.

- The runner writes reports and Codex homes under `.local/skill-evals/`, and creates staged
  workspaces outside the repository so only deliberately staged skills are loadable — the parent
  checkout's live skills never leak into the trigger signal. On both lanes, staged plugin deployment
  copies and the Codex marketplace catalog are siblings of the case workspace rather than project
  files, matching an installed session and keeping them out of project reconnaissance.
- Runtime state is removed as the run goes: each attempt's Codex home once its output is captured,
  and the staged workspaces and run home when the run ends, whether it completed, failed, timed out,
  or was canceled. `report.json` and each attempt's `events.jsonl`, `final.txt`, and `stderr.log`
  under `cases/<case-id>/attempt-<n>/` stay. Pass `--keep-runtime` to retain the homes and
  workspaces for debugging, though the copied `auth.json` is still removed; a directory the runner
  could not remove is printed as a warning and never fails the run.
- Cases with a `workspace` block or `workspace_files` run in an attempt-specific copy of the staged
  workspace. The runner builds the seeded repository identically on both lanes, with a harness-owned
  git identity and signing disabled, so the machine's git configuration cannot affect a run.
- The committed `description` remains the trigger surface under test. Staged skill copies are
  byte-identical to the committed skills on both lanes.
- The runner stops the agent CLI at the trigger decision, so positive cases do not need to finish
  the requested workflow.
- Negative cases stop early too: once the lane's budget of decision-bearing items completes without
  an invocation signal, the run is stopped and classified as a clean skip. The Claude lane allows
  five items and counts text-only assistant turns and non-read tool calls; thinking and `Read`,
  `Glob`, or `Grep` reconnaissance do not consume the budget. The Codex lane allows eight and counts
  every non-reasoning completed item, because its generic command events do not reliably distinguish
  read-only reconnaissance and the model inspects a seeded workspace before it loads a skill.
- Codex has no skill tool or skill event, so on Codex a successful command that prints a staged
  `SKILL.md` from its first line is the invocation signal. `src/trigger-evals/lanes/skill-reads.ts`
  owns the load and inspection forms; through the trigger decision, a command naming a staged
  `SKILL.md` in another form is reported as ERROR, and classifying that form is a harness
  attribution change. A whole-file read made to answer a question about a skill still counts, so
  read `events.jsonl` before tuning a conceptual case that fails only on Codex.
- A skill loaded in the same trigger decision as a skill whose fixture lists it under `applies` is a
  dependency load of that skill's workflow, and the verdict drops it whatever the read order; two
  skills that apply each other both stay invocations. The case line lists the dropped loads after
  `dependency loads`.
- Every staged skill keeps its real invocation policy, and the lane watches each implicitly
  invokable staged skill, so invoking the wrong skill is a distinct, attributable observation. A
  `wrong-skill` result names a plugin skill as `<plugin>:<skill>` and a repo-local sibling by its
  bare skill name. It fails an invoke case — even when the target fires in the same trigger
  decision, because simultaneous invocation is itself trigger-contract overlap — and is surfaced on
  passing skip cases too, because either direction exposes overlap between loaded skills.
- On Claude Code, the runner launches `claude -p` with the Skill tool, the read-only `Read`, `Glob`,
  and `Grep` tools, and the Agent tool, and classifies invocation from the main thread's Skill tool
  events in the stream-json output. A Skill call inside a dispatched sub-agent is not a trigger
  decision, and the sub-agent's events consume no budget; the main thread's Agent call is one
  decision-bearing item. Plugin skills load from the staged plugin copy via `--plugin-dir`;
  repo-local skills load from the staged `.claude/skills/` copy.
- Claude workspaces stage project-only `.claude/settings.json` with `disableBundledSkills: true` so
  bundled skills such as `code-review` do not compete with the target. The runner verifies the
  isolation at runtime: each Claude case checks the init event's `skills` list against the staged
  set (plus the exempt list in `verdict.ts`) and reports an environmental failure when unstaged
  skills leak in, because a leaked skill can steal or provoke an invocation in either direction.
- Staging is lane-specific: only the evaluated agent's config surfaces are written into the
  workspace (`.claude/` for Claude, `.agents/` for Codex), so the other agent's files never pollute
  the workspace under test.
- Attempt pass/fail is based on matching the expected invoke or skip classification, and a case
  passes only when every attempt passes. Exec errors and timeouts remain in the report because
  trigger evals do not validate workflow completion.
- Skip verdicts record how the run ended: natural completion, the decision-item budget, or the case
  timeout. Timeout skips are annotated as weak signals because the model might have invoked after
  the cutoff.
- A trigger eval started inside a sandbox, such as a sandboxed Codex session or a sandboxed Bash
  tool call, kills every case before it executes: the per-case CLI subprocesses apply their own OS
  sandbox and need network and home-directory access, and macOS refuses to nest a second Seatbelt
  sandbox.
