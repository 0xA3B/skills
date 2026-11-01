# mise installs and locks the toolchain

CI needs shfmt and ShellCheck, which no Node.js setup action installs, so CI runs `jdx/mise-action`
in place of the `pnpm/setup` step that #286 added. Locally and in CI, mise installs Node.js, pnpm,
shfmt, and ShellCheck at the releases `mise.lock` pins. `package.json#devEngines` keeps the Node.js
and pnpm ranges, where pnpm and other tooling read them. `devEngines.packageManager` sets
`onFail: "ignore"`, because pnpm's other `onFail` values make it record its own version in
`pnpm-lock.yaml`, a second pin that can drift from `mise.lock`.

## Considered options

- **Keep `pnpm/setup` beside `jdx/mise-action`.** Both would install Node.js from `devEngines`, and
  the step order would decide which installation came first on `PATH`.
- **Move pnpm from `devEngines` to `[tools]` in `mise.toml`.** This removes the second pin too, but
  it moves the pnpm range out of the field that pnpm and other tooling read.

## Consequences

`pnpm/setup` installed the newest Node.js in range when the job ran, with no release-age cooldown.
mise applies the three-day `minimum_release_age` cooldown from `mise.toml` when it resolves the
Node.js range, and `mise.lock` pins the result. CI no longer caches the pnpm store. A contributor
who runs pnpm without mise gets no pnpm version switch or warning.
