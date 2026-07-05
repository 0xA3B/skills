# Plugin Development

## Scope

These instructions apply to plugin directories under `plugins/`.

## Plugin Rules

- Plugin names use lowercase kebab-case and match the plugin directory name.
- Plugins target both Claude Code and Codex by default. A plugin targets an agent by shipping that
  agent's manifest and marketplace entry; omit both to keep a plugin single-agent (for example,
  `claudex` is Codex-only because it exists to drive Claude Code from Codex).
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
- Include an explicit `$plugin-name:skill-name` callout when a prompt should invoke a skill with
  `policy.allow_implicit_invocation: false`.
- Skill-level `agents/openai.yaml` `interface.default_prompt` should normally include the explicit
  `$plugin-name:skill-name` callout for manual-only skills.
- Natural-language prompts are acceptable for implicitly invokable skills when the trigger contract
  is clear, but explicit skill callouts are still fine when they improve determinism.

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
- Name user-invocable skills with an imperative verb phrase (`commit`, `visualize`, `build`). Name
  `user-invocable: false` skills as a state or discipline, typically a gerund phrase
  (`receiving-feedback`), so the model reads them as applicable knowledge rather than an action.
- Use `agents/openai.yaml` for Codex UI metadata and Codex invocation policy. Do not add other Codex
  policy keys to `SKILL.md` frontmatter.
- For manual-only skills, set `policy.allow_implicit_invocation: false` in `agents/openai.yaml` and
  `disable-model-invocation: true` in `SKILL.md` frontmatter. Implicitly invokable skills omit
  `disable-model-invocation`. The linter enforces this parity (`repo/invocation-policy-parity`).
- A skill body may direct the model to use another skill only when the referenced skill is
  implicitly invokable. On Claude Code, `disable-model-invocation` blocks model invocation even when
  the user asks in prose, and this repository keeps invocation behavior identical across agents even
  though Codex can fall back to reading installed skill files. Reference manual-only skills only as
  hand offs that recommend an explicit user invocation.

## Skill Authoring Baseline

- Skills ship to both Claude Code (Claude) and Codex (GPT-5.5). Write instructions that hold up on
  both models by describing the outcome, success criteria, constraints, allowed side effects,
  evidence rules, and final output shape.
- Prefer outcome-first instructions over step-by-step procedures. Keep exact sequences only when
  repository safety, file placement, validation, or command ordering requires them.
- Use absolute instructions such as "must" or "do not" only for true invariants. For judgment calls,
  provide decision rules and missing-evidence behavior.
- Add explicit stopping conditions for tool-heavy workflows: stop when validation passes, when the
  requested artifact is complete, or when a blocker prevents safe execution.
- Remove contradictory or overlapping instructions during prompt review. Both models follow literal
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
- For non-trivial behavior-shaping skills, check the draft with temporary behavior pressure tests
  before treating it as ready. Behavior-shaping skills are skills that ask the agent to resist a
  tempting shortcut, spend extra effort, stop before acting, preserve a safety boundary, or follow a
  workflow that may feel slower than the immediate user request.
- To run a behavior pressure test, write one to three temporary pressure prompts that make a fresh
  agent want to skip, soften, or rationalize around the intended workflow. Use concrete stakes such
  as time pressure, sunk cost, user or reviewer pressure, exhaustion, apparent simplicity, or "just
  this once" framing.
- Run pressure prompts in an isolated agent context: a fresh chat, a subagent with only the needed
  files and explicit skill invocation, or a Codex CLI run with a temporary workspace. The test is
  only meaningful if the model is not relying on the current session's explanation of the desired
  answer.
- Evaluate behavior pressure tests manually. Passing means the agent follows the loaded skill's
  intended behavior, names the relevant constraint, and avoids loopholes. Failing means the agent
  skips the behavior, asks to violate it, invents a hybrid workaround, or rationalizes around the
  rule. Use failures to tighten concrete wording in `SKILL.md`.
- Keep behavior pressure prompts and notes temporary. Put saved scratch under `.local/` or discard
  it. Do not add committed fixtures, eval output, or a harness unless the behavior needs repeatable
  regression coverage and the user explicitly wants that investment.
- For non-trivial pressure testing, use the repo-local `$pressure-test-skill` workflow to keep the
  methodology consistent. It remains a review workflow, not a required validation gate.

## Validation

- Run `pnpm lint:plugins` after adding or changing plugin manifests, marketplace entries, skill
  frontmatter, or `agents/openai.yaml`.
- Run trigger evals when changing an implicitly invokable skill's `SKILL.md` frontmatter
  `description`, invocation policy, or trigger fixtures. The `description` is the trigger contract
  shared by both agents; use `pnpm eval:trigger -- <skill-path> --agent both` to check that a
  description change triggers correctly on Codex and Claude Code. Body-only `SKILL.md` changes
  affect behavior after invocation and do not require trigger evals.
- Run `pnpm format:check` when Markdown, JSON, YAML, or TypeScript files changed.
- Run `pnpm lint` and `pnpm typecheck` when TypeScript validation tooling changed.
