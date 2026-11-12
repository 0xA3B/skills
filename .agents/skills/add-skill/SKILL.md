---
name: add-skill
description: >-
  Use whenever the session adds a new skill to an existing plugin under `plugins/` in this
  repository, or is asked to run this repository's skill-creation workflow. Do not use to create a
  plugin or a repo-local skill under `.agents/skills`, or to change an existing skill.
license: MIT
argument-hint: "[skill-name]"
---

# Add skill

Add one plugin skill under `plugins/<plugin-name>/skills/`. `plugins/AGENTS.md` owns the naming,
frontmatter, invocation-policy, default-prompt, and version rules this workflow applies, and
`writing:agent-instructions` owns the wording of `SKILL.md`.

## Outcome

Finish with a complete skill in an existing plugin: its `SKILL.md`, its Codex UI metadata, trigger
fixtures when it is implicitly invokable, updated README files, a plugin version bump, and passing
validation.

If the target plugin does not exist or is ambiguous, the skill already exists, or validation fails
for a reason this change did not cause, report the blocker and stop.

## Workflow

1. Identify the target plugin, and name the skill by the skill rules in `plugins/AGENTS.md`. If
   `plugins/<plugin-name>/skills/<skill-name>/` exists, stop and report it.
2. Choose the invocation policy. Default to a manual-only skill. Make the skill implicitly invokable
   only when the agent or another skill must reach it without the user naming it, and its
   description can state a trigger contract narrow enough that it does not fire on nearby requests.
   Record the policy in both `SKILL.md` frontmatter and `agents/openai.yaml`.
3. Create `SKILL.md` in the skill directory. Apply `writing:agent-instructions` to the body and the
   description, and use the target plugin's existing skills as examples of local style.
4. Create `agents/openai.yaml` with `interface.display_name`, `interface.short_description`,
   `interface.default_prompt`, and `policy.allow_implicit_invocation`, set by the skill rules and
   the default prompt policy in `plugins/AGENTS.md`.
5. If the skill asks an agent to resist a shortcut or shapes an artifact, run `pressure-test-skill`
   on the draft and apply the changes it finds.
6. If the skill is implicitly invokable, run `optimize-trigger` on it to write `evals/triggers.yaml`
   and run its trigger evals. Done at that workflow's terminal outcome; report a stop for a user
   decision as a blocker.
7. Add the skill to the plugin README and the root `README.md`. Add it to the plugin's default
   prompts only when the default prompt policy in `plugins/AGENTS.md` ranks it among the plugin's
   most useful entry points.
8. Bump the plugin version by the plugin version policy in `plugins/AGENTS.md`.
9. Run `mise exec -- pnpm lint:plugins` and `mise exec -- pnpm format:check`, and fix what they
   report.

## Boundaries

- This workflow creates no plugin and no repo-local skill, and changes other plugin metadata only
  where the skill makes it wrong.
- Stage or commit only when the user asks.
