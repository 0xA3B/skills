# The plugin linter validates local plugin sources only

This repository ships only local plugins and has never listed a remote plugin source, yet the plugin
linter carried optional network checks with their own subprocess, timeout, URL-probing, and
manifest-collection paths. #153 removed those paths, the `--external` option, and the
`lint:plugins:external` script, because the network checks added unused code to the linter. The
linter now rejects a remote Codex catalog source object with an explicit local-only diagnostic.

## Consequences

Local path strings and local source objects stay supported, and URL syntax, file existence,
manifest, and skill checks still run locally. If remote plugin sources become a real requirement,
the parent revision of #153, `2d81f53`, retains the network implementation and its tests as the
rollback path; no replacement probe abstraction was introduced.
