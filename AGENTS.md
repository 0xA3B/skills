# Project instructions

## Purpose

This repository maintains reusable AI-agent skills and workflow guidance that can be installed,
evaluated, and improved over time. Preserve these outcomes:

- Skill instructions remain portable, durable, and useful across agent sessions.
- Plugin distribution stays valid for both Claude Code and Codex through the plugins under
  `plugins/` and their marketplace catalogs, and every plugin is also a valid Agent Plugins 1.0.0
  package that clients of that standard can load.
- Repository-local validation catches broken portable manifests, target extensions, skill metadata,
  and trigger behavior before skills are published or reused.
- Documentation explains how to use and maintain the skills without duplicating temporary workflow
  details that will drift.

## Repository model

- This is a skills repository first. Keep its plugin packaging, the distribution format for Claude
  Code and Codex, under `plugins/`.
- Keep repo-local maintenance workflows under `.agents/skills/`; the `.claude/skills` symlink
  exposes them to Claude Code sessions in this checkout.
- Keep generated eval output and local working artifacts under `.local/`, not tracked project state.
- To work on a branch in parallel with another, create its worktree with
  `pnpm worktree:add <branch>` and remove it with `pnpm worktree:remove <branch>` after the branch
  merges; the add script installs the branch's dependencies there, so hooks and checks run there as
  in the main checkout.

## Nested instructions

`AGENTS.md` is the canonical agent guidance for its directory. Give each `AGENTS.md` a sibling
`CLAUDE.md` that imports `@AGENTS.md` and may add only Claude-specific guidance that doesn't belong
in `AGENTS.md`. When you add, move, or remove a nested `AGENTS.md`, update this list:

- Before reading or editing files under `plugins/` or `.agents/skills/`, read `plugins/AGENTS.md`.
- Before reading or editing files under `src/` or `tests/`, read `src/AGENTS.md`.

## Project conventions

- Use Conventional Commits.
- Keep repository tests under `tests/`, grouped by subsystem; workspace seed tests stay with their
  seeds.
- When a command relies on a runtime tool managed by mise, run it with `mise exec --` in
  non-interactive shells.
- Validate and format through the `package.json` scripts, not raw tool commands. Run
  `pnpm run check` as the default full local gate. When you narrow validation, run the smallest
  relevant targeted scripts: `pnpm format:check` after changing Markdown, JSON, YAML, or TypeScript
  files, and `pnpm lint` and `pnpm typecheck` after changing TypeScript files.
- Keep `check`-suffixed scripts non-mutating.
- Configure shfmt through `.editorconfig` only. shfmt ignores `.editorconfig` when it receives any
  parser or printer flag, such as `-i`, `-ci`, or `-s`, so pass none.
- Before changing an area, read the decision records under `docs/adr/` that touch it.
- When using a plugin skill maintained in this repository, follow its working-tree `SKILL.md` as the
  current workflow authority. The installed marketplace copy may be stale until the plugin is
  reinstalled.

## Dependency policy

Apply `engineering:dependency-policy`, with these additions:

- Renovate is the updater. It takes in-range Node.js, pnpm, and mise tool releases only through
  weekly lockfile maintenance. Once CI passes, it automerges every update that leaves the entries in
  `package.json` and `mise.toml` unchanged, and it holds the rest for review.
- Update major Node.js and TypeScript versions manually; Renovate must not update them.

## Code Review Rules

Before you review a change here or triage review findings on one, read [REVIEW.md](REVIEW.md) and
apply its rules.

## Ubiquitous language

Use these terms, with these meanings, in conversation, code, tests, and documents. When a request,
or code the task changes, uses an alias to avoid or uses a term with a different meaning, say so
before you continue. Change this section, and the Ubiquitous language section of a nested
`AGENTS.md`, through `engineering:ubiquitous-language`.

- **Plugin target**: An agent a plugin ships to (Claude Code or Codex), declared by shipping that
  agent's target extension and marketplace entry. Aliases to avoid: platform, harness.
- **Marketplace catalog**: The root list of plugins this repository exposes to one plugin target as
  its marketplace: `.claude-plugin/marketplace.json` for Claude Code,
  `.agents/plugins/marketplace.json` for Codex. Aliases to avoid: manifest, registry, skills
  repository.
- **Plugin**: A distributable bundle under `plugins/<plugin-name>/` with one portable manifest and
  one target extension per plugin target. Aliases to avoid: skill pack.
- **Portable manifest**: `plugin.json` at the plugin root: the Agent Plugins 1.0.0 manifest every
  plugin ships, and the authoritative source for every field a target extension duplicates. Aliases
  to avoid: plugin manifest, root manifest.
- **Target extension**: The per-target plugin metadata a plugin ships for one plugin target: the
  Codex extension or the Claude extension. Aliases to avoid: plugin manifest, overlay.
- **Codex extension**: The `extensions.com.openai` object of the portable manifest, carrying the
  Codex-specific plugin metadata: `interface`, plus `apps` or `hooks` when a plugin needs them.
  Aliases to avoid: `.codex-plugin`, Codex manifest, overlay.
- **Claude extension**: `.claude-plugin/plugin.json`, the only manifest Claude Code reads; its
  duplicated fields must equal the portable manifest. Aliases to avoid: Claude manifest.
- **Marketplace entry**: One plugin listing inside a marketplace catalog. Aliases to avoid: portable
  manifest, target extension.
- **Plugin skill**: A shipped skill under `plugins/<plugin>/skills/<skill>/`. Aliases to avoid:
  repo-local skill.
- **Shipped content**: Every tracked file under `plugins/<plugin>/` except trigger fixtures under
  `skills/<skill>/evals/`, which install with the plugin but never change its behavior. Aliases to
  avoid: plugin files.
- **Repo-local skill**: A maintenance workflow under `.agents/skills/` used only while working in
  this checkout. Aliases to avoid: plugin skill.
- **Retired skill**: A skill removed from every plugin and kept unchanged under
  `retired/<plugin>/<skill>/` with an index entry, for later review. Aliases to avoid: deprecated
  skill, archive.
- **Codex UI metadata**: `agents/openai.yaml`, the skill-level display metadata and invocation
  policy for Codex. Aliases to avoid: skill frontmatter.
- **Invocation policy**: The paired settings deciding whether an agent may load a skill
  automatically: `allow_implicit_invocation` (Codex, `agents/openai.yaml`) and
  `disable-model-invocation` (Claude Code, `SKILL.md` frontmatter). Aliases to avoid: trigger
  policy.
- **Manual-only skill**: A skill with `allow_implicit_invocation: false` and
  `disable-model-invocation: true`; it should be invoked explicitly by the user. Aliases to avoid:
  disabled skill.
- **Implicit invocation**: An agent automatically loading a skill because the user prompt matches
  the skill description. Aliases to avoid: auto-trigger.
- **Hand off**: A workflow boundary where the current skill stops, summarizes transfer context, and
  recommends the next skill. When that skill is implicitly invokable, the agent continues into it
  only if the user's request already asked for its outcome or for a later outcome that requires it;
  a hand off to a manual-only skill always stops. Aliases to avoid: auto-invoke, delegate.
- **Trigger fixture**: A committed YAML file of positive and negative cases used to evaluate
  implicit invocation behavior. Aliases to avoid: skill test.
- **Trigger eval**: A development-only run that checks whether one plugin or repo-local skill
  invokes or skips for each trigger fixture case on a selected agent (Codex or Claude Code). Aliases
  to avoid: validation gate.
- **Plugin linter**: The local validator behind `pnpm lint:plugins`, covering marketplace, manifest,
  skill, metadata, and instruction-file consistency. Aliases to avoid: validator.
- **Review lane**: A focused review pass over the same target with one intent, such as code review,
  simplification, codebase design, API/seam review, test review, spec adherence, or prose review.
  Aliases to avoid: review scope.
- **Decision record**: One recorded choice that is hard to reverse, surprising without context, and
  a real trade-off, kept as a file under `docs/adr/` with its context and reason. Aliases to avoid:
  ADR issue, design doc, decision label.
- **Frontier**: The items whose prerequisites are already settled and that are useful to work next:
  chunks on a wayfinder decision map, open questions in a grill-me round, acceptance criteria in a
  tdd round. Aliases to avoid: backlog.
- **Trigger contract**: The `description` text that defines when a skill should be implicitly
  invoked. Aliases to avoid: skill summary.

Relationships:

- The repository exposes one **Marketplace catalog** per **Plugin target**.
- A **Marketplace catalog** contains one or more **Marketplace entries**.
- A **Plugin** owns one **Portable manifest**, one **Target extension** per **Plugin target**, and
  zero or more **Plugin skills**.
- A **Plugin skill** owns one `SKILL.md`, plus one **Codex UI metadata** file when the plugin
  targets Codex.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill** on one agent; **Trigger fixtures** are shared across agents.
- A **Review lane** separates review intent from review scope; scope belongs to the invoking review
  workflow.
