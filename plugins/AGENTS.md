# Plugin development

## Plugin rules

- Plugin names use lowercase kebab-case and match the plugin directory name.
- Every plugin ships a portable manifest that conforms to Agent Plugins 1.0.0. The schema is closed,
  so client-specific data goes under `extensions`. A field a target extension duplicates must match
  the portable manifest exactly.
- Plugins target both Claude Code and Codex by default. The linter rejects a target extension
  without its marketplace entry, and an entry without its extension; omit both to keep a plugin
  single-agent.
- Keep Codex settings only in the Codex extension, including its required `interface` block; a
  `.codex-plugin/` directory is a lint error.
- Keep skills under `skills/` at the plugin root. Agent Plugins clients and Claude Code both
  discover that directory, so no manifest names it. Leave the `skills` field unset in the Claude
  extension; the field adds extra skill paths instead of replacing the default.
- When adding or renaming a plugin, keep the marketplace entries, plugin directory, and manifest
  `name` values aligned across every targeted agent.
- When adding a plugin, also create its `plugin:<plugin-name>` label by hand in this repository's
  issue tracker; `meta:submit-skill-feedback` applies feedback labels but never creates them.

## Default prompt policy

- Keep plugin-level `interface.defaultPrompt` to three prompts or fewer; Codex UI surfaces only the
  first three prompts.
- Spend plugin-level prompts on the most useful or interesting entry points, not on every skill in
  the plugin.
- Word every default prompt as a concise action that fits the UI prompt card.
- When the target skill is manual-only, include an explicit `$plugin-name:skill-name` callout in
  plugin-level prompts and in skill-level `interface.default_prompt`. For an implicitly invokable
  skill with a clear trigger contract, a natural-language prompt is enough; you may add the callout
  when it improves determinism.

## Plugin version policy

- Bump at least the patch version for every change to a plugin's shipped content, including skill
  instructions, descriptions, prompts, references, README copy, and metadata. Claude Code pins
  installed plugins to the manifest version and ships updates only when it changes, so an unbumped
  change never reaches existing Claude Code installs. The plugin version check in `pnpm check`
  enforces the bump; bump size stays the author's call under the test below.
- Size a bump by one test: does a user, or a skill that names this one, get something new to use,
  need to do anything differently, or see a new side effect? If not, the plugin does what it already
  claims, better: bump the patch version. If so, bump the minor version unless the major rule below
  applies.
- Patch examples: wording fixes and tightened steps; bug fixes in bundled scripts; new or expanded
  references; README copy and display metadata, such as display names, default prompts, and
  keywords; adding an agent target to an existing plugin, since existing installs see no change;
  description tuning that fixes a misfire a trigger fixture case shows, meaning the skill fired
  outside the scope it already documents or skipped a request inside it.
- Minor examples: a new skill; a new mode, argument, or report field; a new side effect, such as
  posting comments or writing files; a new required input; a change to invocation policy; a
  deliberate change to the scope a skill documents, so it starts or stops handling a kind of
  request; removing a behavior.
- Bump the major version when renaming, removing, or retiring a skill, even when another skill
  absorbs its behavior, because explicit invocations by name, other skills that hand off to or apply
  it by name, and instruction files that point at the skill break. Beyond that, reserve major bumps
  for maintainer discretion when compatibility, trust boundaries, or the packaging model changes
  significantly.
- Apply at most one version bump per plugin per branch. If the branch already bumps the plugin
  version relative to the merge base, fold later changes into that bump, upgrading its size when a
  later change needs a larger bump (for example patch to minor), instead of stacking bumps. When
  more than one skill rename, removal, or retirement is planned for a plugin, make them on one
  branch so they share one major bump.
- Apply each version bump to the portable manifest, and to the Claude extension when the plugin
  ships one, in the same change.

## Skill rules

- Skill names use lowercase kebab-case and match the skill directory name.
- Each skill must include `SKILL.md`. Skills in Codex-targeted plugins must also include
  `agents/openai.yaml`.
- Use `SKILL.md` for runtime instructions and Agent Skills frontmatter. Claude Code-specific
  frontmatter keys (`disable-model-invocation`, `user-invocable`, `when_to_use`, `argument-hint`,
  and the rest of the official frontmatter reference) are allowed because Codex ignores unsupported
  keys. Keep the instructions below the frontmatter agent-agnostic, and put target-specific behavior
  in the metadata surfaces.
- Keep `allowed-tools`, `disallowed-tools`, and `paths` as space- or comma-delimited strings, not
  YAML lists, so the frontmatter stays portable across Agent Skills consumers.
- Do not use the `arguments` frontmatter key. It powers Claude-only `$name` substitution in the
  skill body, which breaks agent-agnostic bodies on Codex; handle arguments in prose instead. The
  linter rejects the key (`repo/skill-arguments`).
- When a skill takes meaningful arguments on invocation, add `argument-hint`; skip it for zero-arg
  skills rather than writing filler hints.
- Use `when_to_use` only when Claude Code needs different trigger tuning than the shared
  `description`; it is appended to the description in Claude's skill listing and the combined text
  is truncated at 1,536 characters. It is never surfaced on manual-only skills.
- Set `user-invocable: false` only for background-discipline skills users should not invoke as a
  command. Never combine it with `disable-model-invocation: true`; the linter rejects the pairing
  (`claude-skill/uninvocable`).
- Name a skill for the workflow it runs or the artifact class it governs, and make the bare name
  stand alone without the plugin prefix: harnesses differ in whether they display the namespaced
  form `plugin-name:skill-name`, and when the two readings conflict, the bare reading wins.
- Name a workflow skill the user runs as a command with an imperative verb phrase (`commit`,
  `diagnose`) by default, or with a compact workflow name (`handoff`, `wayfinder`) when that name
  cannot be read as a background discipline.
- Name a discipline skill for the artifact class or practice it governs (`agent-instructions`,
  `receiving-feedback`). Frontmatter declares invocation posture, so the name does not encode it,
  and a discipline skill may be user-invocable when explicit invocation is useful.
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

## Retiring a skill

- Retire a skill when feedback triage or a maintainer decision finds its job absorbed by other
  skills or user-level conventions. Move its directory unchanged to `retired/<plugin>/<skill>/`, add
  an entry to `retired/README.md` naming the date, last shipped plugin version, reason, absorbing
  surfaces, and the event that would justify revisiting, and remove every hand off, README line,
  manifest description, and keyword that named it.
- A skill whose body and references move into another skill of the same plugin is merged, not
  retired: its content still ships and git history is its record, so it gets no `retired/` copy or
  index entry.
- To retire a whole plugin, retire each of its skills as above, and move any other file a retired
  skill names, such as an agent definition, to the same path under `retired/<plugin>/`. Then delete
  the plugin directory, its marketplace entries, and its README section. Keep the
  `plugin:<plugin-name>` label, because closed issues carry it.
- Nothing under `retired/` ships: no manifest, no marketplace entry, and no linter or trigger-eval
  run covers it.

## Skill authoring baseline

- For plugin skills, use repository-local workflows and validators. Use `add-skill` to create a
  plugin skill, `writing:agent-instructions` for skill-body quality, and `pnpm lint:plugins` for
  repository validation; do not use generic skill scaffolding or validators.
- Use `pressure-test-skill` for non-trivial behavior shaping and `optimize-trigger` for implicit
  invocation behavior. Keep their generated artifacts under `.local/` unless the repository
  intentionally adds repeatable regression coverage.
- Decide which workflow transitions a skill body specifies with the degrees-of-freedom rule in
  `writing:agent-instructions`. A transition known only from enumerating a state matrix, not from an
  observed run, earns a rule only when it passes the enumerated-path test in the root `AGENTS.md`
  `## Code Review Rules`; otherwise wait for the observed run.

## Writing plugin prose output style

- Maintain `plugins/writing/output-styles/prose.md` as the Claude Code output style for chat
  responses, and `plugins/writing/chatbot-instructions.md` as the copy-pasteable chat guidance for
  chat apps without access to installed skills, such as claude.ai and ChatGPT.
- Treat `plugins/writing/skills/prose/SKILL.md` and
  `plugins/writing/skills/prose/references/chat-responses.md` as the behavioral sources for both
  derived copies, the output style and the chatbot instructions. Make each behavior change in a
  source, and update both copies in the same change while preserving their compact forms. Leave out
  of the chatbot instructions every rule that needs tools or an agentic session, such as reports
  after tool work, numbered next steps, and the expected-checks rule, and address the model as "you"
  and the user as "I". Without numbered next steps, the chatbot instructions also ban specific
  offers of more help, such as "If you want, I can ...".
- Keep `plugins/writing/chatbot-instructions.md` at or below 5,000 characters, measured with
  `wc -m`: ChatGPT's custom-instructions field on paid plans rejects longer text.
- Keep `plugins/writing/output-styles/prose.md` at or below 8,000 characters, measured with
  `wc -m plugins/writing/output-styles/prose.md` from the repository root. The body rides in the
  system prompt on every request, so growth costs tokens every turn. When a needed rule does not
  fit, compress or cut other lines first; raise the budget here only when no line can be shortened
  or cut without losing a rule.
- Keep `keep-coding-instructions: true` in the style's frontmatter so Claude Code's software
  engineering instructions stay in force. Scope the style to chat responses and the evidence conduct
  behind them; engineering workflow rules belong to skills and instruction files.

## Validation

- After adding or changing portable manifests, target extensions, marketplace entries, skill
  frontmatter, or `agents/openai.yaml`, run `pnpm lint:plugins`.
- When changing an implicitly invokable skill's `SKILL.md` frontmatter `description` or
  `when_to_use`, invocation policy, or trigger fixtures, run trigger evals. The `description` is the
  trigger contract shared by both agents; use `pnpm eval:trigger -- <skill-path> --agent both` to
  check that a description change triggers correctly on Codex and Claude Code. Trigger evals are
  this repository's costly gate: run the prose lane of `engineering:review-changes` on a
  meaningfully changed `description` or `when_to_use` before each eval run that evaluates wording
  the lane has not reviewed, except a single-case diagnostic run (`--case <id>` without
  `--with-dependents`), because a wording edit after a run forces another run. Body-only `SKILL.md`
  changes affect behavior after invocation and do not require trigger evals.
- Trigger evals stage every marketplace plugin by default, so wrong-skill invocations across plugins
  are reported distinctly. When a description change risks overlapping other skills' trigger
  contracts, widen the selection instead of the staging:
  `pnpm eval:trigger:plugin -- plugins/<plugin>` runs every trigger eval in the plugin, and
  `pnpm eval:trigger:marketplace` runs every trigger eval in the catalog.
