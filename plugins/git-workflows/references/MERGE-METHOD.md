# Merge method selection

Shared policy for `create-pr` and `merge-pr`. Select the expected merge method in this order:

1. repository-enforced policy;
2. explicit user choice;
3. true fast-forward when the forge supports it;
4. rebase when linear history is preferred and commit identity is disposable;
5. merge commit when the topic branch is shared, signed commits or stable commit identities matter,
   durable files reference topic commits, or rebase is unsuitable;
6. squash only when explicitly justified by one semantic unit or unusable topic-branch history.

## Durable SHA search

Before selecting rebase or squash, search tracked and non-ignored untracked text for exact full or
unambiguous abbreviated topic SHAs that the rewrite would invalidate. Start with changed files and
likely durable surfaces such as documentation, changelogs, configuration, and release metadata, then
use bounded repository-aware text search. Exclude binary, generated, dependency, and cache trees. If
credible coverage is impractical, select a merge commit and report the uncertainty.

Treat a durable match as a commit-identity requirement and select a merge commit.
