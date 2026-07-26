# Dependency Policy

The full dependency policy for this repository. `AGENTS.md` carries the few rules that apply to any
change; the rest lives here. Read this before adding or bounding a dependency, and during dependency
maintenance passes.

## Manifests and Bounds

- Treat `package.json` as a compatibility manifest. It declares what the project can work with;
  `pnpm-lock.yaml` declares what it was tested with.
- Leave direct dependencies unbounded unless a compatibility or security requirement justifies a
  constraint.
- Add lower bounds for required features or vulnerable older releases, upper bounds for
  intentionally deferred incompatibilities, exclusions for known-bad releases, and exact pins only
  when a single version is required.
- Prefer the narrowest constraint that expresses the actual requirement, and remove it once the
  requirement no longer holds.

## Lockfile Ownership

- Treat `pnpm-lock.yaml` as the exact tested resolutions.
- Renovate keeps the lockfile updated through its grouped update PRs and a weekly
  `lockFileMaintenance` run. Do not update the lockfile locally during routine dependency
  maintenance.
- When a local lockfile refresh is genuinely needed, use commands such as `pnpm up --no-save` that
  leave `package.json` untouched. Both `pnpm up` and `pnpm up -L`/`--latest` rewrite unbounded specs
  into caret ranges, which violates the unbounded default — `-L` means "ignore the declared ranges",
  not "leave the manifest alone".

## Renovate Scope

Configuration lives in `.github/renovate.jsonc`.

- Renovate runs on a weekly cadence, with lockfile maintenance offset a day later so the update PRs
  are proposed first. Direct dependencies are unbounded, so an unoffset refresh would sweep up
  majors before the major group is reviewed.
- `rangeStrategy` is `update-lockfile`, so in-range updates land as lockfile-only PRs and unbounded
  specs stay unbounded.
- Updates arrive as grouped PRs, not one PR per package. npm non-majors share one group, npm majors
  share a separate group so major release notes can be reviewed apart from routine bumps, and GitHub
  Actions updates share a single group with no major split. Green CI is the baseline signal that a
  grouped update is safe to merge; a group is ready only when every bump in it is ready.
- Renovate does not update Node or TypeScript majors. `.node-version`, `package.json` engines,
  `typescript`, and `@types/node` remain explicit, manual updates, so the npm major group covers
  everything except those.

## Release Cooldown

- All dependencies observe a three-day cooldown on new releases from public registries, enforced
  consistently by `minimumReleaseAge` in both `pnpm-workspace.yaml` and `.github/renovate.jsonc`.
- The cooldown can be bypassed for security patches, and only for those. Renovate PRs and Dependabot
  alerts are the signal to review, not an instruction to expedite; reserve the bypass for
  vulnerabilities urgent enough to interrupt the weekly cadence.
- Renovate clears its own cooldown for vulnerability alerts because `vulnerabilityAlerts` sets
  `minimumReleaseAge` to `null`. This is configured, not default: vulnerability PRs ignore schedule
  and rate limits on their own, but not the cooldown. pnpm enforces the cooldown independently
  during lockfile generation, so a fix younger than three days additionally needs a temporary
  `minimumReleaseAgeExclude` entry in `pnpm-workspace.yaml`:

  ```yaml
  minimumReleaseAgeExclude:
    - fast-uri
  ```

- Remove the exclusion during the next weekly maintenance pass, once the version has aged past the
  cooldown.

## Related Pins

`AGENTS.md` defines which file is canonical for the Node and pnpm versions. What matters here is who
updates them:

- `.node-version` is not Renovate's to change. The `nodenv` manager is disabled outright, so Node
  moves only as a deliberate manual update.
- `package.json#packageManager` is not disabled, so Renovate is expected to propose pnpm bumps
  through the npm manager. Renovate replaced Dependabot recently enough that this has not yet been
  observed on a real PR; confirm it on the first pnpm release, and disable the surface explicitly if
  pnpm should stay manual.

When either moves, check the sibling surfaces that pin the same tool — a version file,
`packageManager`, `engines`, and CI setup actions can drift apart in a single update.
