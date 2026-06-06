# Project Overview

## Purpose

This repository maintains reusable AI-agent skills and workflow guidance that can be installed,
evaluated, and improved over time. Changes should preserve these outcomes:

- Skill instructions remain portable, durable, and useful across agent sessions.
- Codex-facing distribution stays valid through plugin bundles under `codex_plugins/` and the
  marketplace catalog under `.agents/plugins/marketplace.json`.
- Repository-local validation catches broken plugin manifests, skill metadata, and trigger behavior
  before skills are published or reused.
- Documentation explains how to use and maintain the skills without duplicating temporary workflow
  details that will drift.

## Repository Model

- This is a skills repository first; Codex plugins are the current distribution format.
- Keep Codex-specific packaging under `codex_plugins/`.
- Keep repo-local maintenance workflows under `.agents/skills/` if they are added in the future.
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
- Treat `AGENTS.md` as canonical agent guidance; keep sibling `CLAUDE.md` files as symlinks to it.

## Glossary

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

When maintaining the glossary:

- Prefer the canonical term used by domain experts or project maintainers.
- Define what the term is in one tight sentence.
- List aliases to avoid when multiple words could refer to the same concept.
- Flag ambiguous words when the same word is used for different concepts.
- Include relationships between terms when they clarify ownership, lifecycle, or cardinality.
- Skip generic programming terms and incidental class, function, or module names unless they are
  part of the domain language.

| Term                    | Definition                                                                                                                | Aliases to Avoid          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Skills repository**   | This repository, which maintains reusable agent skills and publishes the current Codex distribution surface.              | plugin repo, package      |
| **Marketplace**         | The Codex marketplace distribution surface exposed by this repository.                                                    | skills repository         |
| **Marketplace catalog** | `.agents/plugins/marketplace.json`, the root list of plugins exposed by the marketplace.                                  | manifest, registry        |
| **Plugin**              | A distributable bundle under `codex_plugins/<plugin-name>/` with a `.codex-plugin/plugin.json` manifest.                  | skill pack                |
| **Plugin manifest**     | `.codex-plugin/plugin.json`, the plugin-level metadata consumed by Codex.                                                 | marketplace entry         |
| **Marketplace entry**   | One plugin listing inside `.agents/plugins/marketplace.json`.                                                             | plugin manifest           |
| **Plugin skill**        | A shipped skill under `codex_plugins/<plugin>/skills/<skill>/`.                                                           | repo-local skill          |
| **Plugin version**      | The `.codex-plugin/plugin.json` version used for plugin install, cache, and compatibility decisions.                      | package version           |
| **Repo-local skill**    | A maintenance workflow under `.agents/skills/` used only while working in this checkout.                                  | plugin skill              |
| **Skill body**          | `SKILL.md`, the runtime instructions and frontmatter for a skill.                                                         | metadata, prompt metadata |
| **Codex UI metadata**   | `agents/openai.yaml`, the skill-level display metadata and invocation policy for Codex.                                   | skill frontmatter         |
| **Invocation policy**   | The `policy.allow_implicit_invocation` setting that decides whether Codex may load a skill automatically.                 | trigger policy            |
| **Manual-only skill**   | A skill with `allow_implicit_invocation: false`; it should be invoked explicitly by the user.                             | disabled skill            |
| **Implicit invocation** | Codex automatically injecting a skill because the user prompt matches the skill description.                              | auto-trigger              |
| **Trigger fixture**     | A committed YAML file of positive and negative cases used to evaluate implicit invocation behavior.                       | skill test                |
| **Trigger eval**        | A development-only run that checks whether one plugin or repo-local skill invokes or skips for each trigger fixture case. | validation gate           |
| **Invocation signal**   | The observed evidence that Codex invoked the target skill, using plugin telemetry or an eval-only repo-local canary.      | canary                    |
| **Eval artifact**       | Generated trigger-eval output under `.local/skill-evals/`, not committed project state.                                   | fixture                   |
| **Plugin linter**       | The local validator behind `pnpm lint:plugins`, covering marketplace, manifest, skill, and metadata consistency.          | validator                 |
| **External validation** | Opt-in network or remote URL checks run separately from default local plugin linting.                                     | normal linting            |
| **Brainstorm**          | A read-only exploration workflow that researches and compares solution directions before adversarial review.              | idea list                 |
| **Grill Me**            | A convergence workflow that stress-tests a chosen direction through adversarial questioning before implementation.        | plan                      |
| **Prototype**           | A disposable executable artifact used to answer one design question before real implementation.                           | build, spike              |
| **Build**               | The implementation workflow that delivers working vertical slices with pragmatic validation while interfaces settle.      | prototype                 |
| **TDD**                 | The implementation workflow that delivers behavior through red-green-refactor cycles.                                     | testing phase             |
| **Diagnostic**          | A structured plugin-linter finding with a code, file, message, and pointer.                                               | error string              |
| **Validation context**  | The shared lint-run state passed through plugin-linter checks instead of module-level mutable globals.                    | globals                   |
| **Metadata surface**    | Any file that exposes plugin or skill metadata and must stay aligned with adjacent surfaces.                              | docs                      |
| **Default prompt**      | A suggested prompt shown by Codex for invoking a plugin or skill.                                                         | description               |
| **Trigger contract**    | The `description` text that defines when a skill should be implicitly invoked.                                            | skill summary             |

Relationships:

- A **Marketplace** contains one **Marketplace catalog**.
- A **Marketplace catalog** contains one or more **Marketplace entries**.
- A **Marketplace entry** points to one **Plugin**.
- A **Plugin** owns one **Plugin manifest** and zero or more **Plugin skills**.
- A **Plugin skill** owns one **Skill body** and one **Codex UI metadata** file.
- **Brainstorm** and **Grill Me** can hand off unresolved executable questions to **Prototype**.
- **Prototype** can hand off a validated decision to **Build** or **TDD**.
- **Brainstorm** can hand off a preferred direction to **Grill Me**; **Grill Me** can hand off a
  sufficiently resolved approach to **Build** or **TDD**.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill**.
- **Eval artifacts** are generated under `.local/` and should not be committed.
- **Plugin linter** checks are local and deterministic by default; **External validation** is
  opt-in.
