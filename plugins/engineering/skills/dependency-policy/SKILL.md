---
name: dependency-policy
description: >-
  Use whenever the session adds, removes, upgrades, pins, bounds, or overrides a dependency or a
  toolchain version, even as one step of a larger task; regenerates a lockfile on purpose; or
  changes dependency updater configuration, such as Renovate or Dependabot, or a dependency policy
  section. Do not use to review or merge dependency update PRs.
license: MIT
metadata:
  original_author: Alex Baker
---

# Dependency policy

Default rules for choosing, declaring, constraining, and locking dependencies and toolchain
versions.

## Precedence

The repository's own dependency policy, in its agent guidance, contributing docs, or updater
configuration, wins on every point it covers; apply this skill only where the repository is silent.
When the user's request departs from the policy that applies, follow the request and name the rule
it departs from in your report.

When you write a repository's dependency policy section, such as one in `AGENTS.md`, make it a
one-line pointer to `engineering:dependency-policy` plus only the rules that differ from or add to
this skill.

## Principles

- **Choose:** Before adding a dependency, use a built-in or standard-library capability when one
  fits; otherwise choose a widely adopted, well-maintained, ecosystem-standard package over custom
  code.
- **Bound:** Treat the manifest as a compatibility declaration. Bound each direct dependency below
  its next major release, such as `<22`, and a 0.x dependency below 1, such as `<1`. A routine
  lockfile refresh resolves an unbounded dependency to its newest release, majors included. Where no
  lockfile pins the resolution, such as inline script metadata resolved on each machine, the bound
  alone limits what resolves: bound a 0.x dependency below its next minor release, such as `<0.16`.
  Write an upper bound with only the version segments that define it, such as `<1`, not `<1.0.0`;
  Renovate keeps a bound's precision when it moves the bound, so when 1.0.0 ships, `<1.0.0` becomes
  `<1.0.1`, not `<2`.
- **Constrain minimally:** Beyond those bounds, use a lower bound for a required feature or to
  exclude vulnerable older releases, a tighter upper bound for an intentionally deferred
  incompatibility, an exclusion for a known-bad release, and an exact pin only when no range is
  acceptable. Use the least restrictive constraint that expresses the requirement, and remove it
  when the requirement ends.
- **Transitive:** To constrain a transitive dependency, use the package manager's override or
  constraint mechanism, not a direct declaration added only to control its resolved version.
- **Lock:** Treat lockfiles as the exact tested resolutions. When a dependency change you make
  requires a new resolution, regenerate the lockfile locally; otherwise leave lockfile refreshes to
  the updater. When no updater tracks a pin, such as a release archive pinned by tag and checksum,
  update the pin by hand when the user asks for dependency maintenance, applying the cooldown and
  reading the release notes as for a manifest entry.
- **Release notes:** Before you make or merge a change that rewrites a manifest entry, such as
  moving a bound or pin or replacing a package, read the release notes of each release it adopts.
- **Cooldown:** When you select a release from a public registry or another public release source,
  such as a forge's release tags, choose one older than the cooldown, three days by default. When
  you write resolver or updater configuration, set that cooldown in each one that supports it.
  Bypass the cooldown only for an urgent security fix, with a package-specific exception in each
  applicable resolver and updater, and remove each exception once the release has aged past the
  cooldown.
- **One declaration:** Within each scope that resolves versions, such as a repository or a
  machine-wide tool configuration, declare each tool's version range in exactly one place, and let
  one lockfile pin its exact release; a second declaration or pin drifts from the first. When a
  repository deliberately mirrors a declaration, such as one that lets CI test the range another
  resolver uses, keep the mirror's range equal to the original's.

## Ecosystem references

- When the repository uses pnpm or mise, read [node-pnpm-mise.md](references/node-pnpm-mise.md) for
  where each version is declared and locked, how to write ranges mise reads, and how to take or
  defer a tool release.
- For any other ecosystem, apply the principles with that ecosystem's own manifest, lockfile,
  override, and cooldown mechanisms.

## Boundary

This skill reviews and merges no dependency update PRs. When the user wants that, recommend that
they invoke `engineering:dependency-maintenance` explicitly.
