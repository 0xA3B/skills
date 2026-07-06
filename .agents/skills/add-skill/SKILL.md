---
name: add-skill
description:
  Adds a new plugin skill to an existing marketplace plugin in this repository. Use when the user
  asks to add another skill, workflow skill, or reusable capability under an existing plugin in
  plugins/. This repo-local skill intentionally wraps the built-in skill-creator guidance with this
  repository's plugin layout, metadata, versioning, and validation conventions. Do not use for
  creating new plugins, creating repo-local skills under .agents/skills, editing existing skills,
  adding trigger evals or tests to existing skills, plugin metadata-only changes, conceptual skill
  questions, or skill installation. Never use for requests that target repo-local skills,
  .agents/skills, or trigger fixture maintenance instead of adding a new plugin skill under
  plugins/.
license: MIT
argument-hint: "[skill-name]"
---

# Add Skill

Repo-local wrapper for adding a plugin skill under `plugins/<plugin-name>/skills/`.

Use the built-in `skill-creator` guidance for drafting or materially revising `SKILL.md`. Use this
skill for this repository's plugin placement, metadata, documentation, invocation-policy, and
validation conventions.

## Outcome

Create a complete skill in an existing plugin with the expected repo layout, agent metadata for
every plugin target, plugin-facing docs when useful, and passing plugin validation.

Stop when the new skill is present, relevant metadata/docs are updated, and validation has passed.
If the target plugin is ambiguous, the skill already exists, or validation fails for a reason that
is not clearly caused by this change, report the blocker and the safest next action.

## Source Of Truth

- Follow `plugins/AGENTS.md` for skill metadata placement and authoring rules.
- Follow the built-in `skill-creator` skill for general skill design, progressive disclosure, and
  skill-body drafting. Do not take target paths or repo layout from `skill-creator`.
- Use existing skills in the target plugin as local style examples.
- Keep plugin manifests pointed at `./skills/`; do not add per-skill manifest paths.
- Follow the plugin version policy in `plugins/AGENTS.md`; adding a new skill requires a patch
  version bump unless the user explicitly asks to test same-version behavior.
- Keep runtime instructions in `SKILL.md`.
- Keep Codex UI metadata and Codex invocation policy in `agents/openai.yaml`; keep Claude Code
  invocation policy in `SKILL.md` frontmatter (`disable-model-invocation`). The linter enforces
  parity between the two.
- Bias new skills toward manual invocation. Allow implicit invocation only when the skill has a
  clear trigger contract, the user intent boundary is narrow enough to avoid surprising activation,
  and trigger fixtures are added and validated as part of the workflow.

## Workflow

1. Identify the target plugin and normalize the skill name to lowercase kebab-case. Use an
   imperative verb phrase for user-invocable skills and a state or discipline phrase (typically a
   gerund, such as `receiving-feedback`) for `user-invocable: false` skills.
2. Confirm the skill does not already exist at `plugins/<plugin-name>/skills/<skill-name>/`.
3. Create:

   ```text
   plugins/<plugin-name>/skills/<skill-name>/SKILL.md
   plugins/<plugin-name>/skills/<skill-name>/agents/openai.yaml
   ```

4. Use `skill-creator` guidance to draft `SKILL.md`; apply `plugins/AGENTS.md` for this repo's
   frontmatter and placement rules.
5. Write `agents/openai.yaml` with `interface.display_name`, `interface.short_description`,
   `interface.default_prompt`, and `policy.allow_implicit_invocation`. For manual-only skills, make
   `interface.default_prompt` include the explicit `$plugin-name:skill-name` callout. Use
   `policy.allow_implicit_invocation: false` unless the skill is clearly designed for implicit
   invocation from the start. For manual-only skills, also set `disable-model-invocation: true` in
   `SKILL.md` frontmatter so Claude Code applies the same policy; omit the key for implicitly
   invokable skills. Add `argument-hint` when the skill takes meaningful invocation arguments;
   follow `plugins/AGENTS.md` for the other Claude Code frontmatter keys.
6. If the skill is behavior-shaping, run a behavior pressure test before treating the draft as
   ready. Use the repo-local `pressure-test-skill` workflow; it owns the pressure-test methodology,
   including prompt design, isolated execution, manual evaluation, and scratch handling under
   `.local/`.
7. If `policy.allow_implicit_invocation: true`, add positive and negative trigger fixtures:

   ```text
   plugins/<plugin-name>/skills/<skill-name>/evals/triggers.yaml
   ```

8. Update the plugin README and root `README.md` when the new skill should be visible to plugin
   users.
9. Update Codex plugin default prompts when the skill should be visible from plugin-level prompt
   examples. Keep `interface.defaultPrompt` to three prompts or fewer, choose the most useful entry
   points, and include explicit `$plugin-name:skill-name` callouts for manual-only skills.
10. Bump the patch version in every plugin manifest the plugin ships (`.codex-plugin/plugin.json`
    and `.claude-plugin/plugin.json`) so both agents treat the installed skill set as changed. The
    linter requires the versions to stay in lockstep.
11. Run the skill-creator validator when `uv` is available:

```bash
mise exec -- uv run --with pyyaml python \
  ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/<plugin-name>/skills/<skill-name>
```

If `uv` or Python with PyYAML is unavailable, skip this optional validator and rely on the
repository validation below. This validator only knows the core Agent Skills frontmatter keys, so
ignore its "Unexpected key" finding for `disable-model-invocation` on manual-only skills; the
repository linter validates that key.

12. If implicit invocation is enabled, run trigger validation on both agents:

```bash
mise exec -- pnpm eval:trigger -- plugins/<plugin-name>/skills/<skill-name> --agent both
```

13. Run repository validation:

```bash
mise exec -- pnpm lint:plugins
mise exec -- pnpm format:check
```

## Boundaries

- Do not create a new plugin unless the user explicitly asks for one.
- Do not change plugin metadata unless the new skill affects plugin descriptions, prompts, keywords,
  or visible docs.
- Do not duplicate broad skill-authoring guidance here; keep repo-wide review guidance in
  `plugins/AGENTS.md` and use `skill-creator` for general authoring details.
- Do not stage or commit changes unless the user asks.
