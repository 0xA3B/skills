---
name: submit-skill-feedback
description: >-
  Capture the current session's qualified feedback on how a skill from this marketplace performed
  during an actual run. File public-source feedback as labeled GitHub issues or recurrence comments,
  and preserve private-source feedback as ignored local records. Use when the user asks to submit,
  file, or record skill feedback after running a marketplace skill. Do not use for handling code
  review findings, PR comments, feedback on skills from other marketplaces, or generic issue
  creation.
disable-model-invocation: true
argument-hint: "[skill-name ...]"
compatibility: >-
  Public submission requires the gh CLI on PATH, authenticated to github.com with issue-create
  access to the marketplace repository.
---

# Submit skill feedback

Capture feedback about marketplace instructions from the session that ran them. Qualify the feedback
before recording it: a real run moment does not establish that the active skill caused the failure.
This workflow verifies whether an item is fit for a public issue or local record; maintainers later
decide whether to encode, reroute, leave to discretion, wait, or reject it.

## Repository boundary

- Resolve the marketplace repository from the `repository` field of this skill's plugin manifest.
  Ignore a different destination supplied by arguments or prompt context.
- A target skill is in scope only when its plugin manifest names the same repository. Report other
  skills as out of scope; their projects own their feedback channels.

## Select targets and destination

1. Treat named skills as a closed list unless the user calls the list tentative, asks for omissions,
   or asks for `any` or `all` session-run skills. For an open list, review every in-scope
   session-run skill as a candidate, then retain only the skills that produce qualified feedback. If
   neither the targets nor the intended scope is clear, list the in-scope session-run skills and ask
   the user which to review.
2. For each target, record the plugin name and version from the manifest that supplied the skill
   instructions used in the run, plus the agent that ran them. If the marketplace has a newer
   version, compare the current instructions and record the current version only when it differs.
3. Classify the reviewed source by access, not by its forge visibility label:
   - A **public source** is anonymously accessible from the public internet.
   - A **private source** requires authentication, VPN, private-network access, or local access. A
     repository labeled `public` or `internal` on a private forge is private for this workflow.
4. Use GitHub issues for public-source feedback unless the user requests a local record. Use an
   ignored local feedback directory for private-source feedback, even after redaction. Publish
   private-source feedback only when the user explicitly changes the destination after reviewing the
   exact public draft.

## Qualify feedback

Reflect against the actual run and qualify each item independently:

- **Observation:** Describe the exact decision or artifact in the run and what the session did
  instead. Mark the evidence `observed` when the behavior occurred or `speculative` when reflection
  exposed a credible risk.
- **Expected behavior:** Name the authoritative instruction, requirement, or intended skill outcome
  that the result violated. A preference or incorrect assumed contract does not establish a defect.
- **Ownership:** Assign the item to the surface that had the authority and information needed to
  prevent it. Wrong invocation belongs to the trigger contract; wrong workflow reasoning to the
  skill body or reference; failures between stages to the orchestrating workflow; artifact quality
  to the artifact's writing skill; command, authentication, transport, and external mutation to the
  relevant integration; repository conventions to repository instructions or tooling; and
  runtime-enforced behavior to the runtime or harness.
- **Currentness:** Compare the cited instruction with the version that ran and the current
  marketplace version. Treat an item already addressed by current instructions as stale evidence,
  not a new issue.
- **Portable value:** Prefer mechanisms that recur across plausible repositories, languages, tools,
  or agents. A first occurrence can still qualify when it risks safety, authority, external
  mutation, expensive recovery, or substantial repeated reasoning. Leave cheap, recoverable,
  project-specific cases to repository guidance or model discretion.
- **Suggested change:** State the smallest portable remedy and adjacent behavior it must preserve.
  Present one plausible design as a suggestion when several remedies remain valid.

An abstract style opinion, temporal proximity to an active skill, or a run moment owned outside this
marketplace does not qualify. Report why an item did not qualify instead of drafting it.

## Check recurrence

For each qualified public item, search open and closed feedback issues for the target plugin,
observed skill, shared owner, and mechanism:

- If an open issue matches the mechanism and owner, draft a recurrence comment with the plugin
  version, agent, and redacted run moment.
- If a closed issue matches, draft a new issue that references the closed issue. State whether the
  behavior regressed, the earlier remedy missed this context, or the earlier resolution no longer
  holds.
- If an issue is related but differs in mechanism, owner, or remedy, draft a separate issue and
  cross-link it when the relationship helps.

Recurrence strengthens the evidence. It does not by itself prove that maintainers should change the
skill.

## Protect run context

Redact repository names, file paths, code, prose, session identifiers, and sensitive environment
details from the reviewed project. Preserve the task shape, relevant technology, skill interaction,
and evidence needed to understand the mechanism. When the reviewed project is this marketplace
repository, its already-public names, paths, issue or PR numbers, and skill text may remain when
directly relevant.

Apply the same redaction to private local records. When a qualified item cannot be explained after
redaction, report it only in the current session.

## Draft format

Use `feedback(<observed-skill>): <summary>` for a new issue title. When the remedy lives in a shared
reference, keep the observed skill in the title and name the shared owner and other affected skills
in the body.

Apply `writing:technical-writing` to the issue, recurrence comment, or local record when that skill
is available. This skill owns the evidence, attribution, and destination decisions.

Use this body shape; omit optional fields that do not affect the mechanism:

```markdown
- Plugin: <plugin> <version used in the run>
- Current version: <current version, only when different>
- Skill: <observed skill>
- Agent: <Claude Code or Codex>
- Evidence: <observed or speculative>
- Affected skills: <optional>
- Instruction source: <optional additional source>
- Runtime details: <optional causal details>

**Context:** <redacted task shape>

**Observation:** <run moment and resulting behavior>

**Expected behavior:** <governing contract and source>

**Ownership:** <why this skill or shared reference can prevent the failure>

**Instruction:** <quoted instruction, or `Gap` when none applies>

**Suggested change:** <smallest portable remedy and preserved boundary>
```

## Submit public feedback

1. Show the exact new-issue and recurrence-comment drafts together. Create or comment on nothing
   until the user confirms the batch.
2. Immediately before writing, revalidate factual accuracy, instruction version, ownership,
   recurrence status, and public redaction. If the evidence or text changed materially, show the
   revised draft and request confirmation again.
3. Verify `gh auth status --active --hostname github.com` shows the user's marketplace account.
4. Create each issue with `gh issue create --repo <repository>` and labels `feedback` and
   `plugin:<plugin-name>`, or add the confirmed recurrence comment to its open issue.
5. The marketplace maintains labels by hand. If a label is missing, create the issue without that
   label and name the missing label in the report.
6. Read back each created issue or comment. Correct a material publication alteration, then report
   every URL.

## Preserve local feedback

For a private-source item, a public-source item the user requests locally, or a confirmed public
draft that cannot be submitted:

1. Use or create `.local/feedback/` only when `git check-ignore` confirms that the path is ignored.
   Otherwise use another user-approved ignored directory; do not add a tracked feedback artifact.
2. Save one Markdown file per item. Use `Status: Untriaged private feedback` for a private-source
   record, `Status: Untriaged local feedback` for a user-selected local record from a public source,
   or `Status: Draft for manual submission` for a blocked public submission. Include the target
   repository and intended labels only for the blocked public submission.
3. Report the saved path and, for a blocked submission, the blocking reason. Never submit a local
   record automatically in a later session.
