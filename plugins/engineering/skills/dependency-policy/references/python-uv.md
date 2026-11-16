# Python and uv

How the principles in `SKILL.md` apply to a repository that resolves Python dependencies with uv.
The manifests are `pyproject.toml` and the inline script metadata of PEP 723; the lockfiles are
`uv.lock` and, for a locked script, `<script>.lock`.

- Declare the Python version only in `.python-version`, as a prefix such as `3.14`. When mise
  installs Python, name `python` in `idiomatic_version_file_enable_tools` under `[settings]` in
  `mise.toml`, so mise reads that file.
- `requires-python` in `pyproject.toml`, and each tool setting that names a Python version, such as
  mypy's `python_version` or Ruff's `target-version`, mirrors `.python-version`. When you change the
  Python version, change each mirror in the same change.
- Bound each entry of `[project].dependencies` and `[dependency-groups]` as the Bound principle
  directs, such as `pytest<10` and `ruff<1`.
- When a script with inline metadata has a `<script>.lock` file beside it, that file is the script's
  lockfile: regenerate it with `uv lock --script <script>`. Without that file, uv resolves the
  metadata on each machine that runs the script, so bound a 0.x dependency there below its next
  minor release, such as `tomlkit<0.16`. To make CI test that range, mirror the dependency in
  `[project].dependencies` with the same bound.
- When a dependency change you make requires a new resolution, run `uv lock`, which keeps each
  locked version that the bounds still allow. To take a newer in-range release of one package, run
  `uv lock --upgrade-package <name>`.
- To constrain a transitive dependency, use `constraint-dependencies` under `[tool.uv]`, and
  `override-dependencies` only when the version a package declares must be replaced.
- Set the cooldown as a relative duration: `exclude-newer = "3 days"` under `[tool.uv]`. To bypass
  it for one package, map that package to `false` in the same table, such as
  `exclude-newer-package = { tomlkit = false }`.
