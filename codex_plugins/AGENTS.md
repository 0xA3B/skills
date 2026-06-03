# Plugin Development

## Scope

These instructions apply to plugin directories under `codex_plugins/`.

## Plugin Rules

- Plugin names use lowercase kebab-case and match the plugin directory name.
- Each plugin must include `.codex-plugin/plugin.json`.
- Keep plugin manifests pointed at `./skills/`; do not add per-skill manifest paths.
- Codex marketplace entries belong in `.agents/plugins/marketplace.json`.
- When adding or renaming a plugin, keep the marketplace entry, plugin directory, and manifest
  `name` aligned.

## Plugin Version Policy

- Do not bump the plugin version for content-only updates to existing skills, references, README
  copy, descriptions, prompts, or metadata when the installed skill set, invocation names,
  capability policy, and expected workflow behavior stay the same.
- Bump the patch version when adding a skill, adding non-breaking visible capability, or expanding
  an existing skill without removing prior behavior. A new skill changes the installed skill set and
  needs a fresh plugin version for Codex cache and invocation behavior.
- Bump the minor version when removing or renaming a skill, narrowing invocation availability,
  changing plugin capabilities or install policy, or materially changing expected workflow behavior.
- Reserve major version bumps for maintainer discretion when compatibility, trust boundaries, or the
  packaging model changes significantly.
- When in doubt, choose the smallest bump that reflects user-visible compatibility risk.

## Skill Rules

- Skill names use lowercase kebab-case and match the skill directory name.
- Each skill must include `SKILL.md` and `agents/openai.yaml`.
- Use `SKILL.md` for runtime instructions and skill frontmatter.
- Use `agents/openai.yaml` for Codex UI metadata and invocation policy.
- Do not add Codex invocation policy keys to `SKILL.md` frontmatter.
- For manual-only skills, set `policy.allow_implicit_invocation: false` in `agents/openai.yaml`.

## Skill Authoring Baseline

- Optimize Codex skills and prompts for GPT-5.5 by describing the outcome, success criteria,
  constraints, allowed side effects, evidence rules, and final output shape.
- Prefer outcome-first instructions over step-by-step procedures. Keep exact sequences only when
  repository safety, file placement, validation, or command ordering requires them.
- Use absolute instructions such as "must" or "do not" only for true invariants. For judgment calls,
  provide decision rules and missing-evidence behavior.
- Add explicit stopping conditions for tool-heavy workflows: stop when validation passes, when the
  requested artifact is complete, or when a blocker prevents safe execution.
- Remove contradictory or overlapping instructions during prompt review. GPT-5.5 follows literal
  instructions closely, so stale or vague guidance can cause unnecessary work.
- Treat the `description` as the trigger contract: describe what the skill does and when agents
  should use it.
- Keep `SKILL.md` concise and procedural. Include only context needed to perform the workflow.
- Use progressive disclosure for larger material:
  - keep the core workflow in `SKILL.md`
  - put large reference material, detailed examples, schemas, or API notes in `references/`
  - put deterministic or repeatedly rewritten logic in `scripts/`
  - put templates, images, icons, fonts, or other output resources in `assets/`
- Prefer imperative workflow instructions over broad explanatory documentation.
- Add examples only when they materially reduce ambiguity for the agent using the skill.
- For non-trivial workflows, check the draft against realistic prompts before treating the skill as
  ready.

## Validation

- Run `pnpm lint:plugins` after adding or changing plugin manifests, marketplace entries, skill
  frontmatter, or `agents/openai.yaml`.
- Run `pnpm format:check` when Markdown, JSON, YAML, or TypeScript files changed.
- Run `pnpm lint` and `pnpm typecheck` when TypeScript validation tooling changed.
