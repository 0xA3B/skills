# Fixture contract

A skill's trigger fixture lives at `evals/triggers.yaml` in the skill directory. Each fixture file
must include both positive and negative cases:

```yaml
version: 1
cases:
  - id: commit-message-request
    prompt: >-
      Draft a Conventional Commit message for these changes.
    expect: invoke
    rationale: The user is asking for commit message policy help.

  - id: conceptual-question
    prompt: >-
      What is the purpose of Conventional Commits?
    expect: skip
    rationale: The user is asking a conceptual question, not requesting the workflow.

  - id: project-convention-conflict
    prompt: >-
      Commit these changes.
    workspace_files:
      AGENTS.md: |
        Commit messages must use Gitmoji, not Conventional Commits.
    expect: skip
    rationale: Repository instructions require a different workflow than this skill owns.

  - id: adjacent-workflow
    prompt: >-
      Open a pull request for this branch.
    expect: skip
    invoke-instead: git:create-pr
    rationale: Opening the PR belongs to create-pr.
```

Use positive cases for natural prompts that should load the skill. Keep them representative of real
user intent rather than asking the model to choose a workflow, because workflow-selection wording
can muddy the trigger signal. Use negative cases for nearby prompts that should not load it,
especially conceptual questions, adjacent workflows, or requests owned by a different skill.

When the request in a skip case belongs to another implicitly invokable skill of the same kind, add
a routing assertion: `invoke-instead: <label>` names that alternate, and the case passes only when
the alternate is the only skill that fires.

When a prompt chains outcomes that other implicitly invokable skills also own, such as "commit,
push, and open a PR", write one compound case in the fixture of the skill whose workflow applies the
others: `expect: invoke` with an `invoke-or:` list of the other owners. The case passes when the
target or a listed skill makes the trigger decision and no other skill fires. A case runs no
workflow, so it never shows a later load.

Under both keys, a plugin fixture names a plugin skill as `<plugin>:<skill>` and a repo-local
fixture names a repo-local skill by its bare name. `pnpm lint:plugins` rejects a named skill that is
missing, manual-only, of the other kind, or absent from a plugin target the fixture's plugin ships
on.

When the skill's workflow applies another skill in a step, list its label under a top-level
`applies:`. When a `wrong-skill` result names a skill the workflow applies, declare it there;
otherwise fix the descriptions.

Make every standalone case actionable. When a prompt refers to a file, branch, prior response, or
artifact that the prompt does not contain, add the smallest representative `workspace_files` input
or embed the needed text in the prompt. Missing input can make an agent inspect the empty fixture or
ask for context before selecting a skill, which measures task viability instead of invocation.

A case runs in an empty directory unless it resolves to a `workspace` block or a non-empty
`workspace_files` map, from the case or the fixture default. When a prompt assumes a plausible
project — "review the staged changes", "fix the regex in parseIso", "where should the seam go" —
declare a workspace seed:

```yaml
version: 1
workspace: # fixture-level default; applies to skip cases too
  seed: node-service # evals/seeds/node-service/
  branch: main # optional
  committed: {}
  staged: {}
workspace_files: {} # fixture-level default, merged per path with the case's own (case wins)
cases:
  - id: example
    workspace: { seed: node-service, staged: { src/retry.js: "..." } } # replaces the default
    workspace_files: {}
  - id: other
    workspace: none # opts out of the fixture default
```

Every seeded workspace is a git repository with no remote and one commit holding the seed, the
`committed` files, and the evaluated agent's config surfaces; `staged` files are then added to the
index and `workspace_files` stay unstaged. A seed's own `.gitignore` shapes the seed commit only;
`committed` and `staged` files are always added. Without a `workspace` block, `workspace_files`
alone writes plain files with no git repository.

Seed ownership is one-way: tailor a case to a seed through the `committed`, `staged`, and
`workspace_files` layers, and never edit a seed for one case.

Prefer cheap boundary-question negatives when the nearby workflow would otherwise do substantial
work, such as asking which workflow owns plugin creation or metadata updates. Use action-style
negative prompts only when the near miss itself is important to test.
