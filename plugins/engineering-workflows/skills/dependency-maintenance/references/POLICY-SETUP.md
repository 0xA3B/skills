# Establishing a Repository Dependency Policy

Use this when a repository has no written dependency policy and the user wants one. The policy is a
short document that records decisions this repository has already made or is making now; it is not a
place to import generic best practice.

## Outcome

- One policy document, by default `docs/DEPENDENCIES.md`, that a contributor or agent can read
  before adding, bounding, or updating a dependency.
- A short pointer from the repository's canonical agent guidance (`AGENTS.md`, `CLAUDE.md`, or
  equivalent) carrying only the rules that apply to any change, plus a link to the full document.
- Every claim in the document backed by real configuration in the repository.

## Ground Rules

- **Describe the repository, not the ideal.** Read the actual manifests, lockfiles, updater config,
  and CI before writing a line. If the document and the configuration disagree, either change the
  configuration in the same pass or write down what is actually true.
- **Verify tool-specific details.** Confirm config keys and command flags against the installed
  tool's `--help` or current documentation before putting them in the policy. Guessed flags become
  policy the next reader trusts.
- **Follow the repository's existing documentation conventions** for location, filename, and heading
  style. Only default to `docs/DEPENDENCIES.md` when the repository has no clearer home.
- **Keep the pointer small.** The always-loaded guidance carries the few rules a contributor might
  violate without opening anything else; detail belongs in the policy document.

## Discover First

Inventory what the repository already has:

- Package managers and their manifests and lockfiles, including secondary ecosystems such as CI
  actions, container images, runtime version files, tool managers, and inline script dependencies.
- The dependency updater in use, its schedule, grouping, range strategy, and any disabled rules.
- Existing pins that no updater owns: runtime version files, package-manager pins, `engines`, tool
  lockfiles, CI setup action versions.
- Whether the repository publishes a library, ships an application, or is internal tooling. This
  drives the bound posture more than anything else.

## Decisions the Policy Must Record

Work through each one and write down the decision and its reason:

1. **Bound posture for direct dependencies.** Decide from what the manifest expresses in this
   ecosystem, what the repository publishes, and how consumers resolve dependencies — not from
   repository type alone. Where a manifest declares ranges that downstream consumers resolve, a
   published library has to bound them while an application backed by a lockfile need not. Some
   ecosystems record exact versions in the manifest and leave no range to loosen, which makes the
   question moot. State which situation this repository is in.
2. **When a bound is justified,** and which form to reach for: lower bounds for required features or
   vulnerable older releases, upper bounds for intentionally deferred incompatibilities, exclusions
   for known-bad releases, exact pins only when a single version works.
3. **Lockfile ownership.** Whether the updater or a human owns lockfile changes, and what a
   contributor should do instead of regenerating locks locally. Name the commands that refresh
   without rewriting manifests, where the distinction matters.
4. **Updater scope.** What the updater covers, what it groups, whether majors get their own PR, and
   what signal makes an update safe to merge.
5. **What stays manual.** Runtime and language majors, package-manager pins, and anything else
   deliberately excluded from the updater, with the file each lives in.
6. **Release cooldown.** Whether one applies, how long, and every surface that enforces it. A
   cooldown configured only in the updater is not enforced when a human or agent regenerates a
   lockfile locally.
7. **Cooldown bypass.** What justifies bypassing it, the concrete procedure per enforcing surface,
   and when the exception is removed. Bypass mechanics are the part readers get wrong.
8. **Related pins.** Dependency-adjacent versions the updater does not fully own, and the sibling
   surfaces that must move with them.

## Enforcement Surfaces

A policy is only real where a tool enforces it. For each ecosystem in the repository, map the policy
onto the surfaces that exist:

| Surface                | What it controls                                  | Check for                                                       |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Dependency manifest    | Declared compatibility for direct dependencies    | Bound posture, per-dependency constraint reasons                |
| Lockfile               | Exact tested resolutions                          | Who regenerates it and through what workflow                    |
| Updater configuration  | Cadence, grouping, range strategy, disabled rules | Whether the written policy matches the configured rules         |
| Package-manager config | Local install and resolution behavior             | Cooldown or release-age settings that apply outside the updater |
| Runtime and tool pins  | Versions no dependency bot owns                   | Sibling surfaces pinning the same tool that can drift           |
| CI configuration       | What actually gates a merge                       | Whether the "green CI is the safety signal" claim holds         |

Any policy line with no surface behind it is a convention, not an enforced rule. Say so rather than
implying enforcement.

## Suggested Shape

Adapt headings to the repository's ecosystems; drop sections that do not apply.

```markdown
# Dependency Policy

<one paragraph: what this document is, and when to read it>

## Manifests and Bounds

## Lockfile Ownership

## Updater Scope

## Release Cooldown

## Related Pins
```

## Finish

- Add the pointer to the canonical agent guidance, and state that the policy outranks any general
  dependency defaults an agent or skill brings with it.
- If any of these rules previously lived elsewhere, update the references that point at the old
  location: updater config comments, contributing docs, or PR templates.
- Run the repository's documentation formatting or link checks.
- Report which decisions were read from existing configuration and which the user chose during this
  pass, so the new ones can be revisited.
