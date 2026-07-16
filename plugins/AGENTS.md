# Plugin Development

## Scope

These instructions apply to plugin directories under `plugins/`.

## Plugin Rules

- Plugin names use lowercase kebab-case and match the plugin directory name.
- Plugins target both Claude Code and Codex by default. A plugin targets an agent by shipping that
  agent's manifest and marketplace entry; omit both to keep a plugin single-agent (for example,
  `claude-in-codex` is Codex-only because it exists to drive Claude Code from Codex).
- Codex-targeted plugins include `.codex-plugin/plugin.json` and an entry in
  `.agents/plugins/marketplace.json`.
- Claude-targeted plugins include `.claude-plugin/plugin.json` and an entry in
  `.claude-plugin/marketplace.json`.
- Keep Codex plugin manifests pointed at `./skills/`; do not add per-skill manifest paths.
- Do not set a `skills` path in Claude plugin manifests. Claude Code auto-discovers `./skills/`, and
  the field adds extra skill paths instead of replacing the default.
- When adding or renaming a plugin, keep the marketplace entries, plugin directory, and manifest
  `name` values aligned across every targeted agent.
- Keep `version` identical across a plugin's Claude and Codex manifests; the linter enforces
  lockstep versions.

## Default Prompt Policy

- Keep plugin-level `interface.defaultPrompt` to three prompts or fewer; Codex UI surfaces only the
  first three prompts.
- Use plugin-level prompts to highlight the most useful or interesting entry points, not every skill
  in the plugin.
- Use concise action wording that fits the UI prompt card.
- Include an explicit `$plugin-name:skill-name` callout in plugin-level prompts and in skill-level
  `interface.default_prompt` when the target skill is manual-only. Natural-language prompts are
  acceptable for implicitly invokable skills when the trigger contract is clear, though explicit
  callouts are still fine when they improve determinism.

## Plugin Version Policy

- Bump at least the patch version for any plugin-directory change that should reach existing
  installs, including skill instructions, descriptions, prompts, references, README copy, and
  metadata. Claude Code pins installed plugins to the manifest version and ships updates only when
  it changes, so an unbumped change never reaches existing Claude Code installs.
- Development-only files that ship inside the plugin directory but do not affect installed behavior,
  such as trigger fixtures, do not require a bump on their own.
- Do not bump the plugin version for adding an agent target to an existing plugin. Installs on the
  already-targeted agent see no change, and the new agent installs the plugin fresh at the current
  version. If the same branch also makes a bump-worthy change, apply that bump as usual.
- Bump the patch version when adding a skill, adding non-breaking visible capability, or expanding
  an existing skill without removing prior behavior. A new skill changes the installed skill set and
  needs a fresh plugin version for Codex cache and invocation behavior.
- Bump the minor version when removing or renaming a skill, narrowing invocation availability,
  changing plugin capabilities or install policy, or materially changing expected workflow behavior.
- Reserve major version bumps for maintainer discretion when compatibility, trust boundaries, or the
  packaging model changes significantly.
- When in doubt, choose the smallest bump that reflects user-visible compatibility risk.
- Apply at most one version bump per plugin per branch. If the branch already bumps the plugin
  version relative to the merge base, fold later changes into that bump, upgrading its size when a
  later change needs a larger bump (for example patch to minor), instead of stacking bumps.
- Apply every version bump to all of the plugin's agent manifests in the same change.

## Skill Rules

- Skill names use lowercase kebab-case and match the skill directory name.
- Each skill must include `SKILL.md`. Skills in Codex-targeted plugins must also include
  `agents/openai.yaml`.
- Use `SKILL.md` for runtime instructions and Agent Skills frontmatter. Claude Code-specific
  frontmatter keys (`disable-model-invocation`, `user-invocable`, `when_to_use`, `argument-hint`,
  and the rest of the official frontmatter reference) are allowed because Codex ignores unsupported
  keys; skill bodies stay shared.
- Keep `allowed-tools`, `disallowed-tools`, and `paths` as space- or comma-delimited strings, not
  YAML lists, so the frontmatter stays portable across Agent Skills consumers.
- Do not use the `arguments` frontmatter key. It powers Claude-only `$name` substitution in the
  skill body, which breaks agent-agnostic bodies on Codex; handle arguments in prose instead. The
  linter warns on use (`repo/skill-arguments`).
- Add `argument-hint` when a skill takes meaningful arguments on invocation; skip it for zero-arg
  skills rather than writing filler hints.
- Use `when_to_use` only when Claude Code needs different trigger tuning than the shared
  `description`; it is appended to the description in Claude's skill listing and the combined text
  is truncated at 1,536 characters. It is never surfaced on manual-only skills.
- Set `user-invocable: false` only for background-discipline skills users should not invoke as a
  command. Never combine it with `disable-model-invocation: true`; the linter rejects the pairing
  (`claude-skill/uninvocable`).
- Name skills so invocation posture is obvious from the name alone: a user-invocable skill's name
  reads as an action or workflow the user runs; a `user-invocable: false` skill's name reads as a
  state or discipline, typically a gerund phrase (`receiving-feedback`), so the model reads it as
  applicable knowledge rather than an action.
- Default user-invocable names to an imperative verb phrase (`commit`, `visualize`, `build`).
  Compact workflow names (`handoff`, `wayfinder`) are acceptable when they cannot be read as a
  background discipline.
- A skill adapted from an upstream source may keep the upstream name to preserve its identity, even
  when that name departs from the imperative default.
- Use `agents/openai.yaml` for Codex UI metadata and Codex invocation policy. Do not add other Codex
  policy keys to `SKILL.md` frontmatter.
- For manual-only skills, set `policy.allow_implicit_invocation: false` in `agents/openai.yaml` and
  `disable-model-invocation: true` in `SKILL.md` frontmatter. Implicitly invokable skills omit
  `disable-model-invocation`. The linter enforces this parity (`repo/invocation-policy-parity`).
- A skill body may direct the model to use another skill only when the referenced skill is
  implicitly invokable; `disable-model-invocation` blocks model invocation on Claude Code even when
  the user asks in prose. Reference manual-only skills only as hand offs that recommend an explicit
  user invocation.

## Skill Authoring Baseline

- Skills ship to both Claude Code and Codex. Keep bodies agent-agnostic and use the repository's
  metadata surfaces for target-specific behavior.
- Use the repo-local `writing-skills` discipline when authoring or materially revising `SKILL.md`.
  It owns instruction quality, invocation design, information hierarchy, completion criteria, and
  pruning; this file owns repository placement, metadata, versioning, and validation conventions.
- Use `pressure-test-skill` for non-trivial behavior shaping and `optimize-trigger` for implicit
  invocation behavior. Keep their generated artifacts under `.local/` unless the repository
  intentionally adds repeatable regression coverage.

## Validation

- Run `pnpm lint:plugins` after adding or changing plugin manifests, marketplace entries, skill
  frontmatter, or `agents/openai.yaml`.
- Run trigger evals when changing an implicitly invokable skill's `SKILL.md` frontmatter
  `description`, invocation policy, or trigger fixtures. The `description` is the trigger contract
  shared by both agents; use `pnpm eval:trigger -- <skill-path> --agent both` to check that a
  description change triggers correctly on Codex and Claude Code. Body-only `SKILL.md` changes
  affect behavior after invocation and do not require trigger evals.
- When a description change risks overlapping another skill's trigger contract, use the opt-in suite
  modes: `pnpm eval:trigger:plugin -- plugins/<plugin>` runs every trigger eval in the plugin, and
  `pnpm eval:trigger:marketplace` stages all marketplace plugins and runs every trigger eval across
  them, reporting wrong-skill invocations distinctly.
- Run `pnpm format:check` when Markdown, JSON, YAML, or TypeScript files changed.
- Run `pnpm lint` and `pnpm typecheck` when TypeScript validation tooling changed.
