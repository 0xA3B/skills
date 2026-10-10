# Bundled scripts

What changes when a skill ships executable code: when to bundle a script, the script's contract and
dependencies, and the instruction that runs it. A bundled script leaves the agent the fewest degrees
of freedom: the agent runs the bound path instead of assembling it, and only the script's output
costs context.

## When to bundle

- Bundle a script for a fragile path the agent would otherwise assemble from several commands,
  parsing, pagination, or timing. Each run that assembles the path is another chance to assemble it
  wrong; an observed run that did is the strongest reason to bundle.
- Keep a fragile path that one command covers in the instructions as an exact command line.
- For a batch or destructive step, have the agent write its plan to a file and validate the plan
  with a script before applying it. A passing validator run is the step's completion criterion; make
  each validator error name the fix, such as the valid values for a field it rejects.

## The script's contract

- Put the contract in the script's header comment: usage, arguments, environment overrides,
  defaults, and outcomes. Give each default the reason or workflow concept it derives from — "11
  polls span the ten-minute response timeout", not a bare `11`.
- Give every outcome that changes the workflow's next step its own exit code, and print the code as
  the last output line, so a captured log carries it.
- Keep an error apart from a negative result. When the script cannot run a step or read a source,
  exit with a code no clean or empty result uses and a message naming what failed. Handle what the
  script can decide itself, such as pagination or rechecking state that may have moved; never
  substitute a default value for a failed read.
- Print what the agent acts on next — identifiers, full bodies, the state it classifies — and mark
  truncated output as truncated. Keep progress to one line per iteration.

## Dependencies

- Write against the common tools: `sh` or `bash`, `grep`, `sed`, `awk`, and `jq`. Prefer a common
  tool over a faster or richer one: `bash` over `zsh` or `fish`, `grep` over `rg`. When the workflow
  already requires another tool, such as `gh`, or no common tool fits, add that dependency;
  otherwise use the common tools. Declare each added dependency in the script's header and in the
  instruction that runs the script.
- Write shell that runs on bash 3.2, the version stock macOS ships, and use only the options BSD and
  GNU tools share. The script then runs on macOS and Linux whichever versions come first on `PATH`.
  Leave out associative arrays, `mapfile`, `grep -P`, and the date-parsing options of `date`. Use
  `jq` for lookups and date arithmetic, a `while read` loop for reading lines, and `grep -E` for
  patterns, and edit files in place through a temporary file or with an attached backup suffix
  (`sed -i.bak`).
- Choose the language by the work: shell when the script mostly sequences CLI calls, Python when it
  parses structured data beyond what `jq` filters handle or carries state across many branches.
- Write a Python script as a PEP 723 script that uv runs, and use the standard library where it
  fits. uv is then a dependency the instruction declares.

  ```python
  #!/usr/bin/env -S uv run --quiet --script
  # /// script
  # requires-python = ">=3.12"
  # ///
  ```

  `--script` makes uv read the file as a PEP 723 script whatever its extension, and `--quiet` keeps
  uv's own output out of what the agent reads; the version number is incidental. Give
  `requires-python` a lower bound only, so uv can use an installed interpreter that satisfies it. A
  third-party package resolves at run time on the user's machine, outside any lockfile, and needs
  network access a sandbox may block; when one is necessary, list it under `dependencies` with the
  bounds of the version range you tested.

- Check each declared tool at the start of the script, and exit naming any that is missing, so the
  failure is not reported as a later step's error. Common tools need no check, and uv installs a PEP
  723 script's packages before the script starts.

## The instruction that runs it

At each pointer to a script, state its mode: run it, read it as reference, or copy and edit it as a
template. For a script the agent runs, tell the agent to run it instead of assembling the step from
separate commands, and state:

- the exact command line, with the path from the skill directory and each placeholder defined;
- what the run needs and why, such as network access, credentials outside the sandbox, or the
  foreground;
- the route for a missing dependency: stop and report it to the user, and install nothing into the
  global environment without the user's approval. A command-scoped runner that leaves the global
  environment unchanged, such as `uv run --script`, `uv run --with`, or `npm exec --package`, needs
  no approval. A global install changes state outside the run, so this route is a fragile path;
- the next step for each outcome. Map outcomes to steps here, and leave the mechanics to the
  script's header.

```markdown
Wait for the review with `<skill-dir>/scripts/poll.sh <pr-number>` instead of polling with separate
`gh` calls, where `<skill-dir>` is the directory holding this `SKILL.md` and `<pr-number>` is the
pull request's number. Run it unsandboxed, because `gh` reads credentials from the keyring. The
script needs `gh`; if it is missing, stop and report it to the user instead of installing it. Read
the outcome from the final `exit=` line:

- `0`: the review is clean; classify the reviewer `approved`.
- `1`: unresolved threads follow in the output; triage each one.
- `6`: the script could not read the pull request; retry once, then return `blocked`.
```

The example is correct because it tells the agent to run the script instead of assembling the poll,
gives the one run need with its reason, routes a missing declared tool to the user, and maps every
exit code to a next step; the script name and the exit code numbers are incidental.
