# Codebase Design Lane

Ask whether the change fits the repository's architecture and improves or degrades module depth,
seam placement, locality, leverage, and testability.

Apply `engineering-workflows:codebase-design` and inspect repository conventions, nearby modules,
callers, tests, and `AGENTS.md ## Terminology`.

Look for:

- responsibility placed in the wrong module or duplicated across callers;
- shallow modules that expose nearly as much complexity as they hide;
- seams introduced without real variation, or missing at genuine external boundaries;
- architecture that conflicts with established repository patterns without evidence;
- changes that scatter one concept, force shotgun edits, or make behavior harder to test through an
  interface;
- materially better shapes the change should consider before the current design hardens.

Read [FOWLER-SMELLS.md](FOWLER-SMELLS.md), focusing on Feature Envy, Data Clumps, Primitive
Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, and Refused Bequest.

Before flagging a structure as misplaced, shallow, or unnecessary, read the comments, docs, and
terminology that govern it. A documented, deliberate structure is a finding only when evidence shows
its stated rationale no longer holds; restating the rationale back as a defect is noise.

Do not turn every local cleanup into an architecture finding. Require concrete repository evidence
and a structural remedy.
