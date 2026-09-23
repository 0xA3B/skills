---
name: address-skill-feedback
description: >-
  Triage and address skill feedback from marketplace issues or private local artifacts: verify each
  item against the run evidence and current instructions, identify the correct owner, assign encode,
  reroute, discretion, wait, or reject, apply approved changes under the instruction budget, and
  leave a durable public or private record. Use when the user asks to address, triage, or work
  through skill feedback. Do not use for capturing new feedback from a run, for code review findings
  on a PR, or for conceptual questions about the feedback process; capturing feedback belongs to
  meta:submit-skill-feedback.
disable-model-invocation: true
argument-hint: "[issue-number-or-path ...]"
---

# Address skill feedback

Work through selected feedback from public marketplace issues or private `.local/feedback/`
artifacts and decide, per item, whether instructions change, another owner receives the feedback, or
agent judgment remains the owner. Submission screens evidence and attribution; this workflow is the
decision gate. Its successful outcome is every atomic item encoded, rerouted, left to discretion,
put in `wait` with a reconsideration trigger, or rejected, with a disposition a future reader can
rely on.

## Select feedback

1. If the invocation named issues or local files, use those. Otherwise list open issues labeled
   `feedback` and files directly under `.local/feedback/`, optionally narrowed by the plugin the
   user names. Leave a file whose status line is `Draft for manual submission` to that submission,
   and ignore feedback stored elsewhere under `.local/`, unless the user includes it.
2. Read the source's `Plugin`, `Skill`, version, and previous-name metadata. Use that metadata
   rather than the filename to find renamed skills and aliases.
3. Split a source containing several independent recommendations into atomic feedback items. One
   source can produce different dispositions; do not force the complete source into one status.
   Treat an evaluation-scenario list in the source as validation input for step "Apply and
   re-evaluate", not as a feedback item.
4. Read the current target skill and the cited instruction or gap. Do not assume that the skill
   named in the source is the correct owner.
5. Read each item's evidence line. An `observed` item carries a real run moment; a `speculative`
   item is a noticed risk; when it only enumerates a state, location, or transition, the provenance
   test below decides what it can earn.
6. When a new issue references closed feedback, read the earlier disposition and change. Determine
   whether the behavior regressed, the earlier remedy missed the new context, or the earlier
   resolution did not address the mechanism. When a selected issue already carries a `wait`
   disposition, or a new item matches a record in `.local/feedback-deferred/`, test the recorded
   trigger against the evidence since that disposition; leave the item out of this pass when the
   trigger has not fired. Leave an item whose recorded encode is pending out of this pass until its
   change lands.

## Reconstruct the feedback

Reconstruct the actual run before judging the proposed change:

- Identify the skill activation, the instruction or gap involved, the resulting decision or
  artifact, the correction or workaround, and the downstream outcome.
- Compare the feedback item with the current skill text. Later revisions can already address the
  reported failure or change the surrounding contract. Distinguish the version that produced the
  evidence from the version under review.
- Separate the **observation**, **contract**, and **remedy**. Confirm that the reported behavior
  occurred, identify the authoritative requirement it violated, and evaluate the proposed remedy
  independently. A real observation is not a skill defect when the assumed contract is wrong.
- Preserve useful behavior that the run demonstrated. A failed edge does not make the complete
  workflow a failure.
- Treat a maintainer preference or feature idea as separate input. It can authorize a change, but it
  is not evidence that the skill failed unless the run also violated an established contract.

If an `observed` item's run evidence is unavailable or cannot support the causal claim, disposition
the item as `wait` or `reject`; do not infer a skill failure from the source's confidence. For a
`speculative` item, evaluate whether the claimed mechanism and risk are credible without presenting
them as observed behavior.

## Find the owner

Failure timing does not establish ownership. Assign the failure to the surface that had the
authority and information needed to prevent it:

- A wrong implicit activation belongs to the skill description and its trigger fixtures.
- A wrong decision inside the selected workflow belongs to that skill body or its relevant
  reference.
- A failure between review, editing, validation, and completion belongs to the workflow that
  orchestrates those stages, not to a supporting discipline that returns one stage's result.
- A problem in a README, comment, issue, prompt, or other artifact belongs to the skill that owns
  that artifact type.
- A command, transport, authentication, or external-mutation failure belongs to the relevant tool or
  integration workflow.
- A repository convention belongs to repository instructions, configuration, or tooling when it is
  not part of the marketplace skill's intended domain.
- A recoverable case that a capable model can resolve from visible state can remain agent
  discretion.

Keep one source of truth for each rule. If the correct owner is another skill or workflow, reroute
the feedback instead of copying a defensive rule into the skill that happened to be active.

## Test portability and value

Judge the mechanism separately from the example that exposed it. Answer these six tests for each
item in the disposition you present in "Apply and re-evaluate" step 1; use judgment rather than a
numeric score:

- **Portability:** Would the rule change decisions across plausible repositories, languages, tools,
  models, or harnesses in the skill's scope? Keep local layouts, hook behavior, names, and
  deployment conventions local when they do not define the skill's domain.
- **Failure cost:** Rate the miss by the consequence tiers in `engineering:receiving-feedback`; the
  source's own severity framing is a claim that rating judges. A top-tier miss needs less recurrence
  before it earns an instruction.
- **Provenance:** Did an observed run reach this path, or did the item enumerate a state, location,
  or transition no run has hit? Judge an enumerated item by the transition rule in the skill
  authoring baseline of `plugins/AGENTS.md`: it can earn `encode` only when its failure is silent or
  mutates external state. Otherwise, when its failure is loud and recoverable, disposition it
  `discretion`; when it is not, disposition it `wait` with the trigger "an observed run reaches this
  path".
- **Recoverability:** Can a capable model diagnose and repair the miss cheaply from visible state? A
  recoverable one-off execution error usually remains evidence rather than a new rule.
- **Model discretion:** Would a fixed rule improve a required invariant, or constrain several safe
  approaches that a capable model can select from the current context? Preserve discretion when the
  invariant is already clear and the procedure is state-dependent.
- **Turn reduction:** Even when the model can recover safely, would one portable instruction avoid
  substantial rediscovery, repeated tool calls, or context use across future runs? A rule can earn
  its budget by materially shortening the path to the correct decision.

Count recurrence only across contexts: different repositories, stacks, or causes. Two runs on two
agents that hit one repository and one cause are repetition, and repetition in a context the model
handled correctly is evidence for `discretion`, not for encoding. Ask whether the instruction would
change model behavior versus the default; a rule that only restates capable model behavior does not
earn the attention budget.

The proposed remedy does not inherit the observation's validity. A reviewer can identify a real
failure while proposing an overbroad rule, the wrong owner, or only one of several sound designs.

## Disposition taxonomy

Disposition every atomic feedback item as exactly one of:

- **encode**: the named skill or one of its references is the correct owner, and changing the
  instructions is more reliable than agent discretion. Use for external facts the model cannot
  discover in time, safety and authority boundaries, top-tier failures, or demonstrated judgment
  failures that portable guidance can prevent.
- **reroute**: the feedback is useful, but another skill, workflow, integration, harness, repository
  instruction, or tool is the correct owner. Preserve the evidence and send it to that owner rather
  than encoding it in the named skill.
- **discretion**: the item describes a real situation, but a capable model should decide it from the
  visible state. A fixed rule would overfit one repository, tool, or implementation or would
  constrain several sound approaches.
- **wait**: the feedback is plausible, but the evidence or portability is too weak to encode or
  reject. Keep the item open with the exact recurrence, cost, or cross-context evidence that would
  change the disposition.
- **reject**: the reported mechanism did not occur, the claimed contract is wrong, the issue is
  already addressed, or no actionable feedback remains after correcting its evidence or context.

Recurrence is evidence, not an automatic encoding threshold. One top-tier miss can earn an
instruction immediately. Several cheap occurrences in the same local context can still belong to
repository guidance or discretion.

## Encoding rules

Apply `writing:agent-instructions` to every skill edit, and hold these lines from it especially:

- Prefer replacing the sentence that produced the failure over appending a new one. Judgment
  calibration items in particular should resolve as replace-or-delete more often than append; a fix
  that removes rigidity (a hard cap, an over-specified sequence) is a valid and often the best
  encoding.
- Put external-protocol facts in the reference file for that protocol, not the always-loaded skill
  body.
- Prefer one portable decision rule over a catalog of project examples. A valid encoding can delete
  redundant guidance, narrow an absolute, move conditional mechanics behind a pointer, or preserve a
  bounded safeguard while recalibrating its threshold.
- When triage finds a skill's whole job absorbed by other skills or user-level conventions, the
  encoding can retire the skill; follow the repository's retirement process.
- When an encode touches a lifecycle, storage, ordering, or state-classification rule, apply the
  sibling-cases rule in `engineering:receiving-feedback` before editing.
- While encoding, merge or delete duplicated statements in the same file when the deletion pays for
  an addition; name each in the disposition summary as a maintainer edit, not a feedback item. Hold
  a restructure that moves material between files or reorders sections for its own change unless a
  feedback item names the load or ordering as the failure.

Choose the smallest correct surface:

- Change the description and trigger fixtures for an invocation-boundary failure.
- Change the skill body for guidance every invocation needs.
- Change a routed reference for mode-specific, artifact-specific, or protocol-specific guidance.
- Change the orchestrating workflow when the failure occurs between stages owned by separate skills.
- Preserve model discretion when several safe methods satisfy the same invariant.

State the mechanism and boundary, not the repository example that exposed it. Preserve adjacent
behavior that worked. If the proposed encoding changes the skill's intended scope or conflicts with
prior maintainer direction, present the decision and recommendation before editing.

Follow `plugins/AGENTS.md` for plugin versioning and the repository's required validation surfaces.

## Apply and re-evaluate

1. Present every atomic disposition and proposed owning surface before editing. Group items only
   when they share one mechanism and remedy; preserve independent corroborating sources. When one
   source mixes terminal and `wait` items, say which items stay deferred so the closing record can
   be prepared alongside the change.
2. After approval, create a working branch when the checkout is on the default branch, then
   implement the smallest coherent batch. Yield to project instructions, templates, configuration,
   and tooling instead of copying their discoverable rules into a skill.
3. Re-read the original feedback against the completed diff. Confirm that the change addresses the
   mechanism, preserves the named boundary, and leaves no stale pointer, example, metadata, or
   neighboring rule.
4. Triage findings from self-review, review lanes, or an external reviewer through this same gate. A
   later reviewer finding is new evidence, not an automatic addition to the batch.
5. Validate the owning layer:
   - For a trigger-contract change, run the target skill's fixtures with its dependent cases on
     every supported agent. When the campaign will change more descriptions, defer the adjacent and
     marketplace-wide runs to one pass after the last description change; a fresh eval session has
     no prior turns, so give any fixture that corrects earlier work the corrected text inline.
   - For non-trivial workflow behavior, use `pressure-test-skill` when realistic shortcut pressure
     can test the new decision rule; treat an edit the pressure test proposes as a step 4 finding.
   - Run the repository's targeted checks, then its full gate before declaring the batch complete.
6. If validation exposes a harness, fixture, runtime, or repository failure, reroute that failure.
   Do not weaken the skill change merely to make invalid evidence pass.

## Close with a record

The dispositions below define the desired record, not authority to create it. Before committing,
creating a public issue, or mutating one, show the exact commit scope and message or the exact new
issue, public comment, or closure, then obtain the user's explicit confirmation. Read back every
public mutation and correct a material publication alteration.

For every dispositioned GitHub issue, record each item's disposition as below, then close the issue
only when every item on it is terminal and every encoded change has landed; a `wait` item or an
unlanded encode keeps it open.

- **encode**: reference the issue in the fix commit, comment the pending commit or change request
  when it is created, and name the landed commit on the issue.
- **reroute**: when the owner is another skill in this marketplace, open a replacement issue labeled
  `feedback` and `plugin:<owning-plugin>` that links the original, and record the link on the
  original; if a label is missing, create the issue without it and name the missing label in the
  report. When the owner is this repository's harness, linter, tooling, or instructions, open a
  `bug` or `enhancement` issue that links the original, and record the link on the original. When
  the owner is outside this repository, comment the owner and a link to the record the user filed
  with that owner, or state that no durable record exists. Keep the discussion history by link, not
  by retitling or relabeling the original.
- **discretion**: comment the rationale.
- **wait**: comment the disposition and the evidence that would trigger reconsideration.
- **reject**: comment the evidence that disproves the mechanism, contract, or attribution.
- When one issue mixes terminal and `wait` items, record the terminal items on it, open a focused
  issue labeled `feedback` and `plugin:<plugin>` that carries only the `wait` items and their
  triggers and links the original, so the original can close.

For private local feedback, preserve the same evidence without publishing it:

- Keep untriaged and active sources in `.local/feedback/`. Write each item's disposition, rationale,
  owner, and pending commit or change request into the source when the item is decided, the same
  record a public issue gets.
- Put a `wait` item in `.local/feedback-deferred/` with the exact recurrence, cost, or cross-context
  evidence that would trigger reconsideration.
- For a rerouted private item whose owner is a marketplace skill, save a redacted record for that
  skill in `.local/feedback/` before archiving the source. For any other owner, name in the archived
  file the record the user filed with that owner, or the absence of one.
- After every atomic item in a source reaches a terminal disposition and any encoded change lands,
  record the landed commit, replace the status line, and move the source to
  `.local/feedback-archive/`. Move a `.local/feedback-deferred/` record there once its items reach a
  terminal disposition.
- When one source mixes terminal and deferred items, archive the original and create one focused
  deferred file containing only the unresolved items and their reconsideration triggers.
- Keep these directories ignored and private. Do not turn a local artifact into a public issue
  unless the user separately authorizes publication.
