# Knowledge bases

A knowledge base is a page set read by task: a reader lands on one page from search or a link, needs
one answer, and leaves. Its defects are set-level. A fact stated on two pages drifts, one page that
serves two reader tasks fails both, and a page that reads well in source renders badly on the
platform. This reference governs the page set, the publishing representation, and the rendered
result. The wording rules in `SKILL.md`, the modes in [document-modes.md](document-modes.md), and
the layout rules in [formatting.md](formatting.md) still govern each page.

## Map the set before drafting a page

Write the map first, as a short scratch table or list, and choose pages from it. A set drafted page
by page duplicates facts on the landing page and merges tasks that belong apart.

1. List each audience and the tasks each audience arrives with.
2. Record for each fact its authority: a source you can verify, such as code, configuration, or a
   command you can run, or an owner outside the material, such as a support desk, a service catalog,
   or a platform team. Get each externally owned fact from its owner before drafting. When the owner
   is unavailable, write the fact as unknown and name the owner; a plausible value is a defect.
3. Mark each fact that changes on its own schedule, such as a contact, a limit, a version, or a
   maintenance window, as mutable, and note what changes it: a release, a rota, a contract, or a
   platform decision.
4. Split pages as [document-modes.md](document-modes.md) directs, by audience, lifecycle, or task,
   and also by fact owner. Do not split a page because it is long: a long reference page whose facts
   change together stays one page. Merge pages the same reader needs in one sitting. When one task
   draws on facts from several owners, the task wins: keep the task on one page and link to each
   owner's page for the facts it owns.
5. Give each mutable fact one page that owns it, and name the fact's authority on that page so a
   later editor knows what to verify or whom to ask. Every other page links to that page instead of
   restating the fact, with one exception: a procedure step that needs the value to act, such as an
   overlap window or a version floor, states the value and links to the owning page, so the reader
   acts without leaving the step and the link marks the copy as derived. When the platform can
   include the owner's value by reference, include it instead of copying it.

The map is complete when every task has a page, every fact has an authority, every mutable fact is
marked, and every mutable fact has one owning page.

## Route through one gateway page

Make the landing page a short gateway: state what the set covers and for whom, then route readers by
task to the page that owns each answer. A gateway holds no procedure, no reference table, and no
mutable fact another page owns. Unlike a README, a knowledge-base gateway links to the page that
holds the first working result instead of containing it.

## Define the publishing representation before drafting

Name the target platform before writing. When neither the user nor the project names it, ask; when
no answer is available, write only headings, paragraphs, lists, fenced code blocks, and links, and
report the platform as unknown. Then decide these points and write to them:

- Which source constructs become native platform components: headings, tables, code blocks, notices
  or panels, expandable sections, and cross-page links. Write only in constructs that map to a
  native component. A construct with no native mapping, such as raw HTML, a nested table, or a
  footnote, is not used.
- How the platform renders a line break in the source. When the platform preserves source line
  breaks, keep each paragraph on one source line; a wrapped source line renders as a hard break.
- Where the platform places its own controls: a sidebar, a floating table of contents, a comment
  gutter. Keep content that collides with them at the normal reading width inside the prose column,
  and use a wide layout only where the controls do not reach.

Platform-specific storage syntax and publishing commands belong to project or tool guidance, not to
this reference.

## Write executable examples as interfaces

Apply the code-sample rules in [formatting.md](formatting.md) to every command, request, or form
example in a knowledge base, and also state:

- the actor who performs the step when the reader cannot: the team, role, or system;
- the request or escalation route when the step needs someone else, with where to send it and what
  to include.

## Review the rendered result

Review each page rendered on the platform, at the platform's normal reading width and at one
narrower width, such as a window with the sidebar open, and inspect:

- tables: column collisions, and long inline-code values that wrap inside a cell;
- code blocks: horizontal overflow and lost indentation;
- notices, panels, and expandable sections: whether each rendered as the native component;
- navigation: every cross-page link resolves, and the gateway routes reach every page;
- comments, whitespace, and line wrapping: no stray hard breaks and no doubled blank lines.

After publishing, read each page back through the platform's structured representation, such as an
export or the storage format, when the platform offers one, then repeat the rendered review on the
published page. The publish step can change the rendering.

When you cannot render a page, apply the fallback in [formatting.md](formatting.md).

## Checklist

- The map names each audience, task, and fact authority, marks each mutable fact, and gives every
  mutable fact one owning page.
- Every externally owned fact was confirmed with its owner or is marked unknown with the owner
  named.
- The gateway routes by task and holds no procedure, no reference table, and no mutable fact another
  page owns.
- Every example follows the code-sample rules in `formatting.md`, names its actor when the reader
  cannot perform the step, and gives the request route when the step needs someone else.
- Every page passed the rendered review at both widths after publication, and before publication
  when the platform has a preview, or the review is reported as not done.
