# Project instructions

## Purpose

This repository maintains reusable AI-agent skills and workflow guidance that can be installed,
evaluated, and improved over time. Preserve these outcomes:

- Skill instructions remain portable, durable, and useful across agent sessions.
- Plugin distribution stays valid for both Claude Code and Codex through plugin bundles under
  `plugins/` and the marketplace catalogs under `.claude-plugin/marketplace.json` (Claude Code) and
  `.agents/plugins/marketplace.json` (Codex). Every bundle is also a valid Agent Plugins 1.0.0
  package, so clients that read that standard can load it.
- Repository-local validation catches broken portable manifests, target extensions, skill metadata,
  and trigger behavior before skills are published or reused.
- Documentation explains how to use and maintain the skills without duplicating temporary workflow
  details that will drift.

## Repository model

- This is a skills repository first; Claude Code and Codex plugins are the current distribution
  formats.
- Keep plugin packaging under `plugins/`. Every plugin ships a portable manifest (`plugin.json`,
  Agent Plugins 1.0.0). Agent-specific metadata lives in target extensions and in per-skill
  `agents/openai.yaml`; skill bodies stay agent-agnostic.
- Keep repo-local maintenance workflows under `.agents/skills/`; the `.claude/skills` symlink
  exposes them to Claude Code sessions in this checkout.
- Keep generated eval output and local working artifacts under `.local/`, not tracked project state.
- To work on a branch in parallel with another, create its worktree with
  `pnpm worktree:add <branch>` and remove it with `pnpm worktree:remove <branch>` after the branch
  merges; the add script installs the branch's dependencies there, so hooks and checks run there as
  in the main checkout.

## Project conventions

- Use Conventional Commits.
- Keep repository tests under `tests/`, grouped by subsystem; workspace seed tests stay with their
  seeds.
- Group modules under `src/` into a sub-package directory only when the group has callers outside it
  and a smaller public seam than its parts. The sub-package's `index.ts` only re-exports; its
  sibling modules import each other directly and are private to production code outside the
  directory. Register each sub-package in the `no-restricted-imports` patterns in `.oxlintrc.json`;
  tests may import private modules.
- `.node-version` is the canonical Node version; `package.json#packageManager` is the canonical pnpm
  version.
- When a command relies on a runtime tool managed by mise, run it with `mise exec --` in
  non-interactive shells.
- Use the `package.json` script surface for validation and formatting instead of raw tool commands.
- Use `pnpm run check` as the default full local gate.
- Use the smallest relevant targeted script when narrowing validation.
- Keep `check`-suffixed scripts non-mutating.
- Before changing an area, read the decision records under `docs/adr/` that touch it, and record a
  choice that is hard to reverse there, following `docs/adr/README.md`.
- Treat `AGENTS.md` as canonical agent guidance; sibling `CLAUDE.md` files must import `@AGENTS.md`
  and may add Claude-specific guidance only when it doesn't belong in `AGENTS.md`.
- When using a plugin skill maintained in this repository, follow its working-tree `SKILL.md` as the
  current workflow authority. The installed marketplace copy may be stale until the plugin is
  reinstalled.

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

## Code Review Rules

Every reviewer of a change here applies these rules, plus the `## Code Review Rules` of the
`AGENTS.md` nearest each changed file.

- Rate each finding by the consequence of leaving it unfixed; when that failure is loud or has a
  recovery path, name the signal or path that bounds it.
- When a finding reports a failure path, state whether an observed run reached it (real use of the
  changed workflow or tool) or the reviewer derived it by enumerating states, inputs, or
  configurations. Report an enumerated path as a finding only when its failure is silent, meaning a
  passing status over a wrong result, or when it changes or leaks state outside the run; otherwise
  put it in the review summary as a note for the author.
- In repository tooling (`scripts/`, `src/`, `.agents/skills/*/scripts/`), report as a finding only
  a defect that yields a wrong result under a passing status, changes or leaks state outside the
  run, or breaks the tool's normal use; report every other defect there as a note. Scripts bundled
  under `plugins/` are plugin content, not repository tooling.
- In the Codex skill-read classifier (`src/trigger-evals/lanes/skill-reads.ts`), report a shell form
  as a finding only when a recorded Codex run used it. Report a form derived from shell syntax as a
  note, even when its failure is silent: observed Codex commands set the classifier's scope.
- When a tooling change reproduces external state, such as a repository copy, and a finding concerns
  a case the reproduction does not support, recommend that the tool refuse that case with a visible
  error rather than reproduce it, and state whether the finding asks for refusal or reproduction.
- When reporting one case of a mechanism, list every sibling case in the same finding so one round
  fixes the set; for a record's lifecycle, these are each state, each location the record can live
  in, and each transition between them.
- Prefer a remedy that deletes code or text, narrows an absolute, or delegates to the owner of the
  mechanism over one that adds a special case beside the code or rule under review.
- When a finding's only evidence is the previous round's fix, say so and ask for that fix to be
  reshaped instead of reporting a new case beside it.

## Terminology

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

| Term                         | Definition                                                                                                                                                                                                                                                                                                                            | Aliases to Avoid                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Skills repository**        | This repository, which maintains reusable agent skills and publishes the current Claude Code and Codex distribution surfaces.                                                                                                                                                                                                         | plugin repo, package                     |
| **Plugin target**            | An agent a plugin ships to (Claude Code or Codex), declared by shipping that agent's target extension and marketplace entry.                                                                                                                                                                                                          | platform, harness                        |
| **Marketplace**              | A per-target marketplace distribution surface exposed by this repository.                                                                                                                                                                                                                                                             | skills repository                        |
| **Marketplace catalog**      | The root list of plugins a marketplace exposes: `.claude-plugin/marketplace.json` for Claude Code, `.agents/plugins/marketplace.json` for Codex.                                                                                                                                                                                      | manifest, registry                       |
| **Plugin**                   | A distributable bundle under `plugins/<plugin-name>/` with one portable manifest and one target extension per plugin target.                                                                                                                                                                                                          | skill pack                               |
| **Portable manifest**        | `plugin.json` at the plugin root: the Agent Plugins 1.0.0 manifest every plugin ships, and the authoritative source for every field a target extension duplicates.                                                                                                                                                                    | plugin manifest, root manifest           |
| **Target extension**         | The per-target plugin metadata a plugin ships for one plugin target: the Codex extension or the Claude extension.                                                                                                                                                                                                                     | plugin manifest, overlay                 |
| **Codex extension**          | The `extensions.com.openai` object of the portable manifest, carrying the Codex-specific plugin metadata: `interface`, plus `apps` or `hooks` when a plugin needs them.                                                                                                                                                               | `.codex-plugin`, Codex manifest, overlay |
| **Claude extension**         | `.claude-plugin/plugin.json`, the only manifest Claude Code reads; its duplicated fields must equal the portable manifest.                                                                                                                                                                                                            | Claude manifest                          |
| **Marketplace entry**        | One plugin listing inside a marketplace catalog.                                                                                                                                                                                                                                                                                      | portable manifest, target extension      |
| **Plugin skill**             | A shipped skill under `plugins/<plugin>/skills/<skill>/`.                                                                                                                                                                                                                                                                             | repo-local skill                         |
| **Plugin version**           | The version in the portable manifest, matched by the Claude extension, used for install, cache, and compatibility decisions.                                                                                                                                                                                                          | package version                          |
| **Shipped content**          | Every tracked file under `plugins/<plugin>/` except trigger fixtures under `skills/<skill>/evals/`, which install with the plugin but never change its behavior.                                                                                                                                                                      | plugin files                             |
| **Plugin version check**     | The git-range check behind `pnpm lint:plugin-versions`: each plugin whose shipped content changed since the merge base with `origin/main` must carry exactly one patch, minor, or major increment.                                                                                                                                    | version lint                             |
| **Repo-local skill**         | A maintenance workflow under `.agents/skills/` used only while working in this checkout.                                                                                                                                                                                                                                              | plugin skill                             |
| **Retired skill**            | A skill removed from every plugin and kept unchanged under `retired/<plugin>/<skill>/` with an index entry, for later review.                                                                                                                                                                                                         | deprecated skill, archive                |
| **Skill body**               | `SKILL.md`, the runtime instructions and frontmatter for a skill.                                                                                                                                                                                                                                                                     | metadata, prompt metadata                |
| **Codex UI metadata**        | `agents/openai.yaml`, the skill-level display metadata and invocation policy for Codex.                                                                                                                                                                                                                                               | skill frontmatter                        |
| **Invocation policy**        | The paired settings deciding whether an agent may load a skill automatically: `allow_implicit_invocation` (Codex, `agents/openai.yaml`) and `disable-model-invocation` (Claude Code, `SKILL.md` frontmatter).                                                                                                                         | trigger policy                           |
| **Invocation policy parity** | The linter-enforced rule that a skill's Codex and Claude Code invocation policies express the same decision.                                                                                                                                                                                                                          | policy sync                              |
| **Manual-only skill**        | A skill with `allow_implicit_invocation: false` and `disable-model-invocation: true`; it should be invoked explicitly by the user.                                                                                                                                                                                                    | disabled skill                           |
| **Implicit invocation**      | An agent automatically loading a skill because the user prompt matches the skill description.                                                                                                                                                                                                                                         | auto-trigger                             |
| **Hand off**                 | A workflow boundary where the current skill stops, summarizes transfer context, and recommends the next skill. When that skill is implicitly invokable, the agent continues into it only if the user's request already asked for its outcome or for a later outcome that requires it; a hand off to a manual-only skill always stops. | auto-invoke, delegate                    |
| **Trigger fixture**          | A committed YAML file of positive and negative cases used to evaluate implicit invocation behavior.                                                                                                                                                                                                                                   | skill test                               |
| **Workspace seed**           | Committed project content under `evals/seeds/<name>/`, copied into a case workspace and initialized as a git repository before the agent runs.                                                                                                                                                                                        | scaffold, checkout, fixture workspace    |
| **Routing assertion**        | The `invoke-instead` check on a skip case: the named alternate must be the only skill that fires.                                                                                                                                                                                                                                     | route-to, redirect                       |
| **Dependent case**           | A skip case in another skill's fixture whose routing assertion names the target skill.                                                                                                                                                                                                                                                | dependency                               |
| **Seeded case**              | A trigger fixture case whose resolved workspace names a given workspace seed.                                                                                                                                                                                                                                                         | seed dependent, dependent case           |
| **Trigger eval**             | A development-only run that checks whether one plugin or repo-local skill invokes or skips for each trigger fixture case on a selected agent (Codex or Claude Code).                                                                                                                                                                  | validation gate                          |
| **Attempt**                  | One execution of one trigger fixture case within a trigger eval, numbered from 1; `--repeat <n>` runs n attempts of each selected case.                                                                                                                                                                                               | repeat, iteration, trial                 |
| **Eval lane**                | The per-agent adapter a trigger eval runs through, owning that agent's staging, case execution, and invocation observations. Distinct from a **Review lane**, which is a focused review pass.                                                                                                                                         | review lane, harness                     |
| **Invocation signal**        | The observed evidence that the agent invoked the target skill: a Codex command that prints a staged skill file from its first line, or Claude Code Skill tool events.                                                                                                                                                                 | telemetry, canary                        |
| **Applied skill**            | A skill that another skill's workflow loads in one of its steps, declared under `applies` in the applying skill's trigger fixture; its load in a run that also loads the applying skill is a dependency load, not a trigger decision. A hand-off target is not an applied skill.                                                      | dependency, mention                      |
| **Plugin linter**            | The local validator behind `pnpm lint:plugins`, covering marketplace, manifest, skill, and metadata consistency.                                                                                                                                                                                                                      | validator                                |
| **Review lane**              | A focused review pass over the same target with one intent, such as code review, simplification, codebase design, API/seam review, test review, spec adherence, or prose review.                                                                                                                                                      | review scope                             |
| **Decision map**             | The tracker-neutral output of Wayfinder: a destination, known ground, decision-sized chunks, dependencies, frontier, unresolved fog, and excluded scope.                                                                                                                                                                              | ticket list, spec                        |
| **Decision record**          | One recorded choice that is hard to reverse, surprising without context, and a real trade-off, kept as a file under `docs/adr/` with its context and reason.                                                                                                                                                                          | ADR issue, design doc, decision label    |
| **Candidate**                | Pending work a workflow proposed and set aside until a stated revisit trigger fires, recorded with its evidence as a `candidate:<kind>` issue or a scratch file.                                                                                                                                                                      | deferred finding, backlog item, decision |
| **Frontier**                 | The items whose prerequisites are already settled and that are useful to work next: chunks on a Decision map in wayfinder, open questions in a grill-me round, acceptance criteria in a tdd round.                                                                                                                                    | backlog                                  |
| **Diagnostic**               | A structured plugin-linter finding with a code, file, message, and pointer.                                                                                                                                                                                                                                                           | error string                             |
| **Validation context**       | The shared lint-run state passed through plugin-linter checks instead of module-level mutable globals.                                                                                                                                                                                                                                | globals                                  |
| **Metadata surface**         | Any file that exposes plugin or skill metadata and must stay aligned with adjacent surfaces.                                                                                                                                                                                                                                          | docs                                     |
| **Default prompt**           | A suggested prompt shown by Codex for invoking a plugin or skill.                                                                                                                                                                                                                                                                     | description                              |
| **Trigger contract**         | The `description` text that defines when a skill should be implicitly invoked.                                                                                                                                                                                                                                                        | skill summary                            |

Relationships:

- The repository exposes one **Marketplace** per **Plugin target**.
- A **Marketplace** contains one **Marketplace catalog**.
- A **Marketplace catalog** contains one or more **Marketplace entries**.
- A **Marketplace entry** points to one **Plugin**.
- A **Plugin** owns one **Portable manifest**, one **Target extension** per **Plugin target**, and
  zero or more **Plugin skills**.
- A **Target extension** is either the **Codex extension** or the **Claude extension**.
- A **Plugin skill** owns one **Skill body**, plus one **Codex UI metadata** file when the plugin
  targets Codex.
- A **Plugin skill** becomes a **Retired skill** when it leaves its **Plugin**.
- A **Trigger eval** runs **Trigger fixtures** against one implicitly invokable **Plugin skill** or
  **Repo-local skill** on one agent; **Trigger fixtures** are shared across agents.
- A **Trigger eval** executes through exactly one **Eval lane**, the adapter for the selected agent.
- A **Trigger eval** runs one or more **Attempts** of each selected case; the case passes only when
  every **Attempt** passes.
- Each **Trigger fixture** case runs in zero or one **Workspace seed**; a **Workspace seed** is
  shared by every fixture that names it, and the cases whose resolved workspace names it are its
  **Seeded cases**.
- A **Trigger fixture** skip case carries zero or one **Routing assertion**; the cases whose
  **Routing assertion** names a skill are that skill's **Dependent cases**.
- A **Trigger fixture** lists zero or more **Applied skills** of its skill.
- **Plugin linter** checks are local and deterministic; the **Plugin version check** reads git
  history, so it runs as its own command instead of a **Plugin linter** rule.
- A **Candidate** closes when its implementation lands, when a **Decision record** declines it, or
  with a stated invalidation reason.
- A **Candidate** joins the **Frontier** of a codebase pass once its revisit trigger fires.
- A **Review lane** separates review intent from review scope; scope belongs to the invoking review
  workflow.
