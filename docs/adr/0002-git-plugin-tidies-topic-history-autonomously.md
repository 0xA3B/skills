# The git plugin tidies topic-branch history without asking

The git plugin used to require explicit authorization before it force-pushed rewritten history, yet
the agent authors most commits on a topic branch and the goal is tidy history at merge. Issue #117
settled that `git:tidy-history`, which owns every rewrite of existing commits, rewrites a topic
branch and force-pushes it with a lease on the remote head it recorded, without asking. On `main`,
the remote's default branch, or the change request's target, it only reports its plan, and it never
runs a plain `--force`.

## Considered options

- **Tidy once, before merge.** One hand-off point would be simpler, but `git:merge-pr` gates on the
  reviewed head, so every pull request would pay an extra review round after approval. Instead,
  `git:create-pr` and `git:address-pr-feedback` tidy inside pushes that already reset review, and
  `git:merge-pr` runs the skill in review mode as a gate.
- **An explicit-approval path for protected branches and plain force.** Approval would cost the user
  about the same as running the commands themselves, and it would add a rarely used branch of
  instructions that must define what counts as approval. A lease rejection means the remote moved,
  so a plain force would discard someone else's commits.

## Consequences

Review fixes fold into the commit they correct unless they stand alone as their own rollback
boundary. The pull request threads keep the review record. Review replies can cite SHAs that a later
round rewrites. For a topic branch the forge protects against force pushes, the forge's rejection of
the push is the only guard; the skill does not query forge protection.
