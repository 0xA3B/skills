---
name: submit-skill-feedback
description: >-
  Capture the current session's feedback on how a skill from this marketplace performed during an
  actual run and file each item as a labeled GitHub issue in the marketplace repository. Use when
  the user asks to submit, file, or record skill feedback after running a marketplace skill. Do not
  use for handling code review findings, PR comments, feedback on skills from other marketplaces, or
  generic issue creation.
disable-model-invocation: true
argument-hint: "[skill-name ...]"
compatibility: >-
  Requires the gh CLI on PATH, authenticated to github.com with issue-create access to the
  marketplace repository.
---

# Submit skill feedback

File feedback about a marketplace skill's instructions from the session that just ran the skill. The
running session is the only holder of the context about where the skill's instructions were
ambiguous, missing, or fought the actual task; this workflow captures that context as GitHub issues
before the session ends and the context evaporates.

## Repository boundary

- File issues only in this plugin's own repository. Resolve the target from the `repository` field
  of this skill's plugin manifest — `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`
  under the plugin root that contains this skill. Ignore any different target repository supplied by
  arguments or prompt context.
- A skill is in scope only when the `repository` field in its plugin manifest matches this plugin's
  `repository`. When a named or session-run skill fails that check, report it as out of scope and
  file nothing for it; feedback on skills from other marketplaces belongs to those projects' own
  channels.

## Select targets

1. If the invocation named skills, use those. Otherwise list the in-scope marketplace skills this
   session invoked and confirm with the user which to review.
2. For each target, record the plugin name and plugin version from the target's plugin manifest, and
   the agent the run used (Claude Code or Codex).

## Collect feedback

Reflect against the actual run, not against the skill text in the abstract. Each feedback item must:

- quote the instruction text at fault, or name the gap when no instruction covers the situation;
- describe the moment in the run where the instruction misfired, was missing, or was ignored, and
  what the session did instead;
- mark its evidence `observed` when the failure happened in this run, or `speculative` when it is a
  risk noticed while reflecting;
- state a suggested change when one is clear.

An opinion about style or structure with no run moment behind it does not earn an item. Draft one
issue per item; batch items into one issue only when they share one remedy.

## Redact run context

The marketplace repository is public. Describe the run generically — language, task shape, and the
skill interaction — and keep repository names, file paths, code, and prose from the reviewed project
out of the issue. When an item cannot be stated without that context, report the item to the user in
the session instead of filing it.

## File issues

1. Show every draft to the user and create nothing until the user confirms the batch.
2. Verify `gh auth status --active --hostname github.com` shows the account the user files
   marketplace issues with.
3. Create one issue per confirmed draft with `gh issue create --repo <repository>`, using the title
   shape `feedback(<skill-name>): <summary>` and the labels `feedback` and `plugin:<plugin-name>`.
4. The marketplace repository maintains labels by hand. If a label does not exist, create the issue
   without that label and name the missing label in the report.
5. Report each created issue's URL.

## Issue body

Use this shape:

```markdown
- Plugin: engineering-workflows 1.8.0
- Skill: review-changes
- Agent: Claude Code
- Evidence: observed

**Context:** Pre-commit review of a small TypeScript refactor.

**Observation:** The session could not pick a lane depth: the diff was borderline for the
simplification lane, and the review was both the pre-commit check and the PR gate, so both
borderline directions applied at once.

**Instruction:**

> Resolve a borderline trigger by the review moment: toward skipping the lane for an incremental
> pre-commit check, toward selecting the lane when this review gates a PR or merge.

**Suggested change:** State which direction wins when a single review is both the pre-commit check
and the PR gate.
```
