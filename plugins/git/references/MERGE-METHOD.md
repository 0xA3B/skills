# Merge method selection

Shared policy for `create-pr` and `merge-pr`. Select the expected merge method in this order:

1. repository-enforced policy;
2. explicit user choice;
3. true fast-forward when the forge supports it;
4. rebase when linear history is preferred and commit identity is disposable;
5. merge commit by default to preserve the reviewed topic commits and their identities;
6. squash only when explicitly justified by one semantic unit or unusable topic-branch history.

## Durable SHA search

Before selecting rebase or squash, search changed files and likely durable tracked or non-ignored
text for exact full or unambiguous abbreviated topic SHAs that the rewrite would invalidate. Include
known forge-hosted references named by the user, an issue, or a hand-off artifact; do not crawl the
forge. A forge-hosted reference requires stable commit identity only when the SHA must remain in
target history or the selected forge cannot guarantee a resolvable ref to the original commit. A
retained change-request head ref is sufficient otherwise. If a durable match requires stable commit
identity and a higher-precedence repository policy or explicit user choice selects a rewriting
method, stop for a user decision. Otherwise, select a merge commit when policy permits it or stop
when it does not.
