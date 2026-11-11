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

- Before reading or editing files under `plugins/`, read `plugins/AGENTS.md`.
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
- Before changing an area, read the decision records under `docs/adr/` that touch it, and record a
  choice that is hard to reverse there, following `docs/adr/README.md`.
- When using a plugin skill maintained in this repository, follow its working-tree `SKILL.md` as the
  current workflow authority. The installed marketplace copy may be stale until the plugin is
  reinstalled.

## Dependency policy

- Prefer built-in or standard-library capabilities when they fit the problem; otherwise prefer
  widely adopted, well-maintained ecosystem-standard packages over custom implementations.
- Treat `package.json` as a compatibility manifest. Bound each direct dependency below its next
  major release, such as `<22`, and a 0.x dependency below 1, such as `<1`. Weekly automerged
  lockfile maintenance resolves an unbounded dependency to its newest release, majors included.
- Beyond those bounds, use lower bounds for required features or to exclude vulnerable older
  releases, tighter upper bounds for intentionally deferred incompatibilities, exclusions for
  known-bad releases, and exact pins only when no version range is acceptable. Use the least
  restrictive constraint that expresses the requirement, and remove it when the requirement ends.
- When a transitive dependency must be constrained, use the owning package manager's constraint or
  override mechanism. Do not declare it as a direct dependency solely to control its resolved
  version.
- Treat `pnpm-lock.yaml` and `mise.lock` as the exact tested resolutions. Let Renovate perform
  routine lockfile refreshes; regenerate a lockfile locally when a requested dependency change
  requires a new resolution.
- Before merging a Renovate PR that rewrites a dependency entry in `package.json` or a version in
  `mise.toml`, read the release notes of each release it adopts; Renovate automerges every other
  update once CI passes.
- Declare the Node.js and pnpm ranges only in `package.json#devEngines`, and every other
  mise-managed tool in `mise.toml` `[tools]`; mise installs each at the release `mise.lock` pins.
- Write a version range that mise reads, including the `devEngines` ranges, as a prefix such as
  `26`, not a caret or comparison range such as `^26.12.1`; mise ignores `mise.lock` for those.
- Declare pnpm in `devEngines.packageManager` as a major range such as `12` with `onFail: "ignore"`.
  Any other `onFail` value makes pnpm lock its own version in `pnpm-lock.yaml`, a second pin that
  drifts from `mise.lock`. An exact version would receive no in-range updates, because Renovate
  leaves in-range pnpm releases to lockfile maintenance.
- Set `mise.toml` tools to `latest` and let CI catch breaking releases. To take an in-range release
  before Renovate's lockfile maintenance, run `mise lock --bump`. To defer a specific tool
  incompatibility, pin the tool to an exact version and restore `latest` once the incompatibility is
  fixed; Renovate holds each PR that moves the pin for review.
- Update major Node.js and TypeScript versions manually; Renovate must not update them.
- Require a three-day cooldown before selecting releases from public registries, in every resolver
  and updater that supports one: Renovate, pnpm, and mise. Bypass the cooldown only for an urgent
  security fix, with a package-specific exception in each applicable resolver or updater, and remove
  the exception once the release has aged out.

## Code Review Rules

Before you review a change here or triage review findings on one, read [REVIEW.md](REVIEW.md) and
apply its rules.

## Terminology

Change this section, and the Terminology section of a nested `AGENTS.md`, through
`engineering:terminology`.

- **Skills repository**: This repository, which maintains reusable agent skills and publishes them
  through one marketplace catalog per plugin target. Aliases to avoid: plugin repo, package.
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
- **Workspace seed**: Committed project content under `evals/seeds/<name>/`, copied into a case
  workspace and initialized as a git repository before the agent runs. Aliases to avoid: scaffold,
  checkout, fixture workspace.
- **Routing assertion**: The `invoke-instead` check on a skip case: the named alternate must be the
  only skill that fires. Aliases to avoid: route-to, redirect.
- **Compound case**: An invoke case whose request chains outcomes that other skills also own; it
  lists those skills under `invoke-or` and passes when the target or a listed skill makes the
  trigger decision. Aliases to avoid: chained case, invoke-also.
- **Dependent case**: A case in another skill's fixture that names the target skill, in a routing
  assertion or a compound case's `invoke-or` list. Aliases to avoid: dependency.
- **Seeded case**: A trigger fixture case whose resolved workspace names a given workspace seed.
  Aliases to avoid: seed dependent, dependent case.
- **Trigger eval**: A development-only run that checks whether one plugin or repo-local skill
  invokes or skips for each trigger fixture case on a selected agent (Codex or Claude Code). Aliases
  to avoid: validation gate.
- **Attempt**: One execution of one trigger fixture case within a trigger eval, numbered from 1;
  `--repeat <n>` runs n attempts of each selected case. Aliases to avoid: repeat, iteration, trial.
- **Eval lane**: The per-agent adapter a trigger eval runs through, owning that agent's staging,
  case execution, and invocation observations. Aliases to avoid: review lane, harness.
- **Invocation signal**: The observed evidence that the agent invoked a staged skill: a Codex
  command that prints a staged skill file from its first line, or a Claude Code assistant message
  with Skill tool calls. Aliases to avoid: telemetry, canary.
- **Trigger decision**: An attempt's first invocation signal and the staged skills it loads; later
  loads are workflow behavior outside the trigger decision. Aliases to avoid: observation window.
- **Applied skill**: A skill that another skill's workflow loads in one of its steps, declared under
  `applies` in the applying skill's trigger fixture; its load in the same trigger decision as the
  applying skill is a dependency load, not a separate invocation. A hand-off target is not an
  applied skill. Aliases to avoid: dependency, mention.
- **Plugin linter**: The local validator behind `pnpm lint:plugins`, covering marketplace, manifest,
  skill, metadata, and instruction-file consistency. Aliases to avoid: validator.
- **Review lane**: A focused review pass over the same target with one intent, such as code review,
  simplification, codebase design, API/seam review, test review, spec adherence, or prose review.
  Aliases to avoid: review scope.
- **Decision record**: One recorded choice that is hard to reverse, surprising without context, and
  a real trade-off, kept as a file under `docs/adr/` with its context and reason. Aliases to avoid:
  ADR issue, design doc, decision label.
- **Candidate**: Pending work a workflow proposed and set aside until a stated revisit trigger
  fires, recorded with its evidence as a `candidate:<kind>` issue or a scratch file. Aliases to
  avoid: deferred finding, backlog item, decision.
- **Frontier**: The items whose prerequisites are already settled and that are useful to work next:
  chunks on a wayfinder decision map, open questions in a grill-me round, acceptance criteria in a
  tdd round. Aliases to avoid: backlog.
- **Metadata surface**: Any file that exposes plugin or skill metadata and must stay aligned with
  adjacent surfaces. Aliases to avoid: docs.
- **Trigger contract**: The `description` text that defines when a skill should be implicitly
  invoked. Aliases to avoid: skill summary.

Relationships:

- The repository exposes one **Marketplace catalog** per **Plugin target**.
- A **Marketplace catalog** contains one or more **Marketplace entries**.
- A **Marketplace entry** points to one **Plugin**.
- A **Plugin** owns one **Portable manifest**, one **Target extension** per **Plugin target**, and
  zero or more **Plugin skills**.
- A **Target extension** is either the **Codex extension** or the **Claude extension**.
- A **Plugin skill** owns one `SKILL.md`, plus one **Codex UI metadata** file when the plugin
  targets Codex.
- A **Plugin skill** becomes a **Retired skill** when it leaves its **Plugin**.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill** on one agent; **Trigger fixtures** are shared across agents.
- A **Trigger eval** executes through exactly one **Eval lane**, the adapter for the selected agent.
- A **Trigger eval** runs one or more **Attempts** of each selected case; the case passes only when
  every **Attempt** passes.
- An **Attempt** has zero or one **Trigger decision**.
- Each **Trigger fixture** case runs in zero or one **Workspace seed**; a **Workspace seed** is
  shared by every fixture that names it, and the cases whose resolved workspace names it are its
  **Seeded cases**.
- A **Trigger fixture** skip case carries zero or one **Routing assertion**; the cases whose
  **Routing assertion** names a skill are that skill's **Dependent cases**.
- A **Compound case** lists one or more other skills and is a **Dependent case** of each; it asserts
  only the first **Trigger decision**
  ([ADR 0004](docs/adr/0004-compound-cases-assert-the-first-trigger-decision.md)).
- A **Trigger fixture** lists zero or more **Applied skills** of its skill.
- A **Candidate** closes when its implementation lands, when a **Decision record** declines it, or
  with a stated invalidation reason.
- A **Candidate** joins the **Frontier** of a codebase pass once its revisit trigger fires.
- A **Review lane** separates review intent from review scope; scope belongs to the invoking review
  workflow.
