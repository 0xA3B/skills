# Collaborative comments

Use this reference for technical comments in Jira or other issue trackers, pull request and merge
request reviews, and replies to human or automated reviewers. A collaborative comment is durable
technical prose inside an ongoing conversation: write to the person in the thread while preserving
enough context for a future reader.

## Respond to the thread

- Read the comment or ticket context before drafting the reply. Address the specific concern or
  update instead of restating the complete ticket, change, or private review report.
- Start with the concern, decision, or material change. Skip an inventory of everything that already
  passed unless it changes the reader's conclusion.
- Address the author directly. Use first person for your judgment or work you performed. Use "we"
  only when the comment legitimately speaks for the team.
- Translate internal workflow statuses into natural prose. State what changed or why the concern
  does not apply instead of opening with labels such as "accepted" or "rejected".
- Preserve warmth through natural cadence and acknowledgment, not generic praise or reflexive
  agreement.

## Choose the comment shape

- For a ticket update, state what changed, the durable evidence or detail, and the next action.
- For a new review comment, state the problem, evidence, consequence, and requested change.
- For a review reply, state what changed or why it remains unchanged, the relevant validation, and
  whether the thread can be resolved.

Use these as content checks, not mandatory templates. Keep one independently actionable concern per
review comment; combine concerns when they share one mechanism and remedy. Distinguish observed
evidence from a recommendation, explain why the requested change matters, and end with the concrete
decision, question, or next action when one exists.

## Attribute the comment

Open each comment you publish with this line in italics, followed by a blank line. Replace
`<harness>` with the name of the harness running you, such as Claude Code or Codex, not the model:

```markdown
_Written by <harness> on this user's behalf._
```

When the user, the repository, or the platform sets its own authorship-disclosure policy, follow
that policy instead. Leave the line out of a draft the user publishes themselves.

## Publish and resolve

Treat drafting, publishing, and resolving as separate actions with separate authority. Approval to
draft or publish a comment does not authorize resolving its thread. Inspect the exact comment body
before publishing it. When the system supports readback, verify the published comment and correct
any material alteration before resolving or closing the thread.
