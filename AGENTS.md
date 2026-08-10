# Project instructions

## Purpose

This repository maintains reusable AI-agent skills and workflow guidance that can be installed,
evaluated, and improved over time. Preserve these outcomes:

- Skill instructions remain portable, durable, and useful across agent sessions.
- Plugin distribution stays valid for both Claude Code and Codex through plugin bundles under
  `plugins/` and the marketplace catalogs under `.claude-plugin/marketplace.json` (Claude Code) and
  `.agents/plugins/marketplace.json` (Codex).
- Repository-local validation catches broken plugin manifests, skill metadata, and trigger behavior
  before skills are published or reused.
- Documentation explains how to use and maintain the skills without duplicating temporary workflow
  details that will drift.

## Repository model

- This is a skills repository first; Claude Code and Codex plugins are the current distribution
  formats.
- Keep plugin packaging under `plugins/`. Agent-specific metadata lives in each plugin's
  `.claude-plugin/` and `.codex-plugin/` manifests and in per-skill `agents/openai.yaml`; skill
  bodies stay agent-agnostic.
- Keep repo-local maintenance workflows under `.agents/skills/`; the `.claude/skills` symlink
  exposes them to Claude Code sessions in this checkout.
- Keep generated eval output and local working artifacts under `.local/`, not tracked project state.

## Project conventions

- Use Conventional Commits.
- Keep tests co-located in `src/`.
- `.node-version` is the canonical Node version; `package.json#packageManager` is the canonical pnpm
  version.
- When a command relies on a runtime tool managed by mise, run it with `mise exec --` in
  non-interactive shells.
- Use the `package.json` script surface for validation and formatting instead of raw tool commands.
- Use `pnpm run check` as the default full local gate.
- Use the smallest relevant targeted script when narrowing validation.
- Keep `check`-suffixed scripts non-mutating.
- Treat `AGENTS.md` as canonical agent guidance; sibling `CLAUDE.md` files must import `@AGENTS.md`
  and may add Claude-specific guidance only when it doesn't belong in `AGENTS.md`.

## Dependency policy

- Prefer built-in or standard-library capabilities when they fit the problem; otherwise prefer
  widely adopted, well-maintained ecosystem-standard packages over custom implementations.
- Treat `package.json` as a compatibility manifest. Leave direct dependencies without version
  constraints by default; add constraints only for documented compatibility or security
  requirements.
- Use lower bounds for required features or to exclude vulnerable older releases, upper bounds for
  intentionally deferred incompatibilities, exclusions for known-bad releases, and exact pins only
  when no version range is acceptable. Use the least restrictive constraint that expresses the
  requirement, and remove it when the requirement ends.
- When a transitive dependency must be constrained, use the owning package manager's constraint or
  override mechanism. Do not declare it as a direct dependency solely to control its resolved
  version.
- Treat `pnpm-lock.yaml` as the exact tested resolution. Let Renovate perform routine lockfile
  refreshes; regenerate it locally when a requested dependency change requires a new resolution.
- Update major Node.js and TypeScript versions manually; Renovate must not update them.
- Require a three-day cooldown before selecting releases from public registries. Enforce it in every
  resolver and updater that can select those releases.
- Bypass the cooldown only for an urgent security fix. Keep explicit exceptions package-specific in
  every applicable resolver or updater, and remove them once the release has aged out.

## Terminology

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

| Term                         | Definition                                                                                                                                                                                                    | Aliases to Avoid          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Skills repository**        | This repository, which maintains reusable agent skills and publishes the current Claude Code and Codex distribution surfaces.                                                                                 | plugin repo, package      |
| **Plugin target**            | An agent a plugin ships to (Claude Code or Codex), declared by shipping that agent's plugin manifest and marketplace entry.                                                                                   | platform, harness         |
| **Marketplace**              | A per-target marketplace distribution surface exposed by this repository.                                                                                                                                     | skills repository         |
| **Marketplace catalog**      | The root list of plugins a marketplace exposes: `.claude-plugin/marketplace.json` for Claude Code, `.agents/plugins/marketplace.json` for Codex.                                                              | manifest, registry        |
| **Plugin**                   | A distributable bundle under `plugins/<plugin-name>/` with one plugin manifest per plugin target.                                                                                                             | skill pack                |
| **Plugin manifest**          | Per-target plugin metadata: `.claude-plugin/plugin.json` for Claude Code, `.codex-plugin/plugin.json` for Codex.                                                                                              | marketplace entry         |
| **Marketplace entry**        | One plugin listing inside a marketplace catalog.                                                                                                                                                              | plugin manifest           |
| **Plugin skill**             | A shipped skill under `plugins/<plugin>/skills/<skill>/`.                                                                                                                                                     | repo-local skill          |
| **Plugin version**           | The version kept in lockstep across a plugin's manifests, used for install, cache, and compatibility decisions.                                                                                               | package version           |
| **Repo-local skill**         | A maintenance workflow under `.agents/skills/` used only while working in this checkout.                                                                                                                      | plugin skill              |
| **Skill body**               | `SKILL.md`, the runtime instructions and frontmatter for a skill.                                                                                                                                             | metadata, prompt metadata |
| **Codex UI metadata**        | `agents/openai.yaml`, the skill-level display metadata and invocation policy for Codex.                                                                                                                       | skill frontmatter         |
| **Invocation policy**        | The paired settings deciding whether an agent may load a skill automatically: `allow_implicit_invocation` (Codex, `agents/openai.yaml`) and `disable-model-invocation` (Claude Code, `SKILL.md` frontmatter). | trigger policy            |
| **Invocation policy parity** | The linter-enforced rule that a skill's Codex and Claude Code invocation policies express the same decision.                                                                                                  | policy sync               |
| **Manual-only skill**        | A skill with `allow_implicit_invocation: false` and `disable-model-invocation: true`; it should be invoked explicitly by the user.                                                                            | disabled skill            |
| **Implicit invocation**      | An agent automatically loading a skill because the user prompt matches the skill description.                                                                                                                 | auto-trigger              |
| **Hand off**                 | A workflow boundary where the current skill stops, summarizes transfer context, and recommends the next explicit skill.                                                                                       | auto-invoke, delegate     |
| **Trigger fixture**          | A committed YAML file of positive and negative cases used to evaluate implicit invocation behavior.                                                                                                           | skill test                |
| **Trigger eval**             | A development-only run that checks whether one plugin or repo-local skill invokes or skips for each trigger fixture case on a selected agent (Codex or Claude Code).                                          | validation gate           |
| **Eval lane**                | The per-agent adapter a trigger eval runs through, owning that agent's staging, case execution, and invocation observations. Distinct from a **Review lane**, which is a focused review pass.                 | review lane, harness      |
| **Invocation signal**        | The observed evidence that the agent invoked the target skill: an eval canary in Codex output, Claude Code Skill tool events, or legacy Codex skill-injection telemetry as a secondary signal.                | telemetry                 |
| **Eval canary**              | An eval-only token injected into a staged skill copy so its appearance in agent output proves invocation: body-only for plugin skills, description-rewrite for repo-local skills on Codex.                    | invocation signal         |
| **Plugin linter**            | The local validator behind `pnpm lint:plugins`, covering marketplace, manifest, skill, and metadata consistency.                                                                                              | validator                 |
| **External validation**      | Opt-in network or remote URL checks run separately from default local plugin linting.                                                                                                                         | normal linting            |
| **Review lane**              | A focused review pass over the same target with one intent, such as code review, simplification, codebase design, API/seam review, test review, spec adherence, or prose review.                              | review scope              |
| **Decision map**             | The tracker-neutral output of Wayfinder: a destination, known ground, decision-sized chunks, dependencies, frontier, unresolved fog, and excluded scope.                                                      | ticket list, spec         |
| **Frontier**                 | The items whose prerequisites are already settled and that are useful to work next: chunks on a Decision map in wayfinder, open questions in a grill-me round, acceptance criteria in a tdd round.            | backlog                   |
| **Diagnostic**               | A structured plugin-linter finding with a code, file, message, and pointer.                                                                                                                                   | error string              |
| **Validation context**       | The shared lint-run state passed through plugin-linter checks instead of module-level mutable globals.                                                                                                        | globals                   |
| **Metadata surface**         | Any file that exposes plugin or skill metadata and must stay aligned with adjacent surfaces.                                                                                                                  | docs                      |
| **Default prompt**           | A suggested prompt shown by Codex for invoking a plugin or skill.                                                                                                                                             | description               |
| **Trigger contract**         | The `description` text that defines when a skill should be implicitly invoked.                                                                                                                                | skill summary             |

Relationships:

- The repository exposes one **Marketplace** per **Plugin target**.
- A **Marketplace** contains one **Marketplace catalog**.
- A **Marketplace catalog** contains one or more **Marketplace entries**.
- A **Marketplace entry** points to one **Plugin**.
- A **Plugin** owns one **Plugin manifest** per **Plugin target** and zero or more **Plugin
  skills**.
- A **Plugin skill** owns one **Skill body**, plus one **Codex UI metadata** file when the plugin
  targets Codex.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill** on one agent; **Trigger fixtures** are shared across agents.
- A **Trigger eval** executes through exactly one **Eval lane**, the adapter for the selected agent.
- **Plugin linter** checks are local and deterministic by default; **External validation** is
  opt-in.
- A **Review lane** separates review intent from review scope; scope belongs to the invoking review
  workflow.
