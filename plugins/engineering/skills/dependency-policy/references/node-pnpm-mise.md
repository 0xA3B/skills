# Node.js, pnpm, and mise

How the principles in `SKILL.md` apply to a repository that runs Node.js with pnpm and installs its
toolchain with mise. The manifests are `package.json` and `mise.toml`; the lockfiles are
`pnpm-lock.yaml` and `mise.lock`.

- Declare the Node.js range only in `package.json#devEngines.runtime`, pnpm as the next item says,
  and every other mise-managed tool in `mise.toml` `[tools]`. mise installs each at the release
  `mise.lock` pins. This requires `lockfile = true` and an `idiomatic_version_file_enable_tools`
  list that names `node` under `[settings]` in `mise.toml`.
- Declare pnpm in one place, in a form that stops pnpm from locking its own version in
  `pnpm-lock.yaml`, a second pin that drifts from `mise.lock`. When the repository already uses one
  of these forms, keep it; otherwise use the first:
  - In `package.json#devEngines.packageManager`, as a major range such as `12` with
    `onFail: "ignore"`, with `pnpm` added to `idiomatic_version_file_enable_tools`. Any other
    `onFail` value makes pnpm lock its own version. An exact version would block the in-range
    releases a lockfile refresh takes.
  - In `mise.toml` `[tools]`, with no `packageManager` and no `devEngines.packageManager` field in
    `package.json`.
- Write each `package.json#devEngines` range mise reads as a prefix such as `26`, not a caret or
  comparison range such as `^26.12.1`; mise ignores `mise.lock` for those, and
  `MISE_LOCKED=1 mise install` fails.
- Set each `mise.toml` `[tools]` version to `latest`, not a prefix such as `0.11`: Renovate and
  `mise lock --bump` resolve a prefix only within it, and Renovate opens no PR to move it, so the
  tool never reaches the next major. Let CI catch breaking releases. To take an in-range release
  before the next routine lockfile refresh, run `mise lock --bump`. To defer a specific tool
  incompatibility, pin the tool to an exact version, and restore `latest` once the incompatibility
  is fixed.
- Set the cooldown in both resolvers: `minimumReleaseAge` in `pnpm-workspace.yaml`, in minutes, and
  `minimum_release_age` under `[settings]` in `mise.toml`.
