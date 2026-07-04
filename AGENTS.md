# Project Overview

## Purpose

This repository maintains reusable AI-agent skills and workflow guidance that can be installed,
evaluated, and improved over time. Changes should preserve these outcomes:

- Skill instructions remain portable, durable, and useful across agent sessions.
- Plugin distribution stays valid for both Claude Code and Codex through plugin bundles under
  `plugins/` and the marketplace catalogs under `.claude-plugin/marketplace.json` (Claude Code) and
  `.agents/plugins/marketplace.json` (Codex).
- Repository-local validation catches broken plugin manifests, skill metadata, and trigger behavior
  before skills are published or reused.
- Documentation explains how to use and maintain the skills without duplicating temporary workflow
  details that will drift.

## Repository Model

- This is a skills repository first; Claude Code and Codex plugins are the current distribution
  formats.
- Keep plugin packaging under `plugins/`. Agent-specific metadata lives in each plugin's
  `.claude-plugin/` and `.codex-plugin/` manifests and in per-skill `agents/openai.yaml`; skill
  bodies stay agent-agnostic.
- Keep repo-local maintenance workflows under `.agents/skills/`; the `.claude/skills` symlink
  exposes them to Claude Code sessions in this checkout.
- Keep generated eval output and local working artifacts under `.local/`, not tracked project state.

## Project Conventions

- Commit messages must follow Conventional Commits.
- Keep tests co-located in `src/`.
- Use mise for runtime management.
- Use `mise exec --` in non-interactive shells when the command relies on a runtime tool managed by
  mise.
- `package.json#packageManager` is the canonical pnpm version; mise only ensures a pnpm launcher is
  available.
- Use the `package.json` script surface for validation and formatting instead of raw tool commands.
- Use `pnpm run check` as the default full local gate.
- Use the smallest relevant targeted script when narrowing validation.
- Scripts with the `check` suffix should be non-mutating.
- Keep README user-facing and lightweight.
- Keep AGENTS files agent-facing, lightweight, and focused on durable guidance. Avoid temporary
  notes or details that may go stale quickly.
- Treat `AGENTS.md` as canonical agent guidance; sibling `CLAUDE.md` files must import `@AGENTS.md`
  and may add Claude-specific guidance only when it doesn't belong in `AGENTS.md`.

## Terminology

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

When maintaining the terminology:

- Prefer the canonical term used by domain experts or project maintainers.
- Define what the term is in one tight sentence.
- List aliases to avoid when multiple words could refer to the same concept.
- Flag ambiguous words when the same word is used for different concepts.
- Include relationships between terms when they clarify ownership, lifecycle, or cardinality.
- Skip generic programming terms and incidental class, function, or module names unless they are
  part of the domain language.

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
| **Invocation signal**        | The observed evidence that the agent invoked the target skill: an eval canary in Codex output, Claude Code Skill tool events, or legacy Codex skill-injection telemetry as a secondary signal.                | telemetry                 |
| **Eval canary**              | An eval-only token injected into a staged skill copy so its appearance in agent output proves invocation: body-only for plugin skills, description-rewrite for repo-local skills on Codex.                    | invocation signal         |
| **Eval artifact**            | Generated trigger-eval output under `.local/skill-evals/`, not committed project state.                                                                                                                       | fixture                   |
| **Behavior pressure test**   | A manual or ad hoc check that runs a loaded skill against realistic shortcut pressure to see whether the skill changes agent behavior.                                                                        | trigger eval, fixture     |
| **Pressure prompt**          | A temporary prompt used in a behavior pressure test to make an agent want to skip, soften, or rationalize around a workflow rule.                                                                             | trigger fixture           |
| **Plugin linter**            | The local validator behind `pnpm lint:plugins`, covering marketplace, manifest, skill, and metadata consistency.                                                                                              | validator                 |
| **External validation**      | Opt-in network or remote URL checks run separately from default local plugin linting.                                                                                                                         | normal linting            |
| **Review lane**              | A focused review pass over the same target with one intent, such as simplification, correctness, security, test coverage, or spec adherence.                                                                  | review scope              |
| **Brainstorm**               | A read-only exploration workflow that researches and compares solution directions before adversarial review.                                                                                                  | idea list                 |
| **Grill Me**                 | A convergence workflow that stress-tests a chosen direction through adversarial questioning before implementation.                                                                                            | plan                      |
| **Prototype**                | A disposable executable artifact used to answer one design question before real implementation.                                                                                                               | build, spike              |
| **Build**                    | The implementation workflow that delivers working vertical slices with pragmatic validation while interfaces settle.                                                                                          | prototype                 |
| **TDD**                      | The implementation workflow that delivers behavior through red-green-refactor cycles.                                                                                                                         | testing phase             |
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
- A **Hand off** recommends an explicit **Manual-only skill** invocation; it does not automatically
  load another skill.
- A **Skill body** may direct the model to use another skill only when the referenced skill is
  implicitly invokable; manual-only skills are referenced through a **Hand off** instead.
- **Brainstorm** and **Grill Me** can hand off unresolved executable questions to **Prototype**.
- **Prototype** can hand off a validated decision to **Build** or **TDD**.
- **Brainstorm** can hand off a preferred direction to **Grill Me**; **Grill Me** can hand off a
  sufficiently resolved approach to **Build** or **TDD**.
- A **Repo-local skill** is exposed to Claude Code as a project skill through the `.claude/skills`
  symlink.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill** on one agent; **Trigger fixtures** are shared across agents.
- **Eval artifacts** are generated under `.local/` and should not be committed.
- A **Behavior pressure test** evaluates behavior after a skill is loaded; it does not evaluate
  whether the skill should load.
- **Pressure prompts** are temporary by default and should not become **Trigger fixtures** unless
  the repository intentionally adds repeatable behavior regression coverage.
- **Plugin linter** checks are local and deterministic by default; **External validation** is
  opt-in.
- A **Review lane** separates review intent from review scope; scope belongs to the invoking review
  workflow.
