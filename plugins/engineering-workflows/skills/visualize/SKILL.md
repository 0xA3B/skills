---
name: visualize
description: >-
  Create a temporary visual artifact from the current chat, plan, review, comparison, architecture
  map, decision tree, timeline, or other structured session output. Use when the user explicitly
  asks to visualize, turn the discussion into a cleaner visual report, make an HTML report, create a
  diagram, or produce a presentation-only artifact from existing analysis.
license: MIT
metadata:
  original_author: Alex Baker
disable-model-invocation: true
---

# Visualize

Turn existing analysis into a clearer presentation artifact. This skill changes presentation only:
do not change the underlying recommendation, plan, diagnosis, or decision payload.

## Outcome

Produce a temporary visual artifact that makes the current session easier to inspect, compare, or
share. Keep the essential conclusion available in chat even when an HTML or image artifact is
created.

## Allowed Side Effects

- Create temporary files outside tracked project state.
- Create files under `.local/` only when the user wants the artifact near the repository.
- Use Tailwind, Mermaid, image generation, or remote assets when they improve the artifact.
- Present a generated HTML artifact locally: a harness built-in browser, the OS opener, or the
  reported file path.
- Start and stop a temporary localhost server for an HTML artifact when that is the most reliable
  way to present it in an in-app browser.
- Do not stage, commit, publish, or persist the artifact as project documentation unless the user
  explicitly asks.

## Choose The Artifact

Choose the smallest artifact that improves comprehension:

- Use Markdown when the user only needs a cleaner textual summary, table, or decision record.
- Use HTML when the content benefits from layout: candidate cards, side-by-side comparisons,
  timelines, dashboards, architecture maps, grouped evidence, or diagrams.
- Use Mermaid inside HTML for precise flows, dependency graphs, sequence diagrams, state machines,
  timelines, and decision trees.
- Use inline SVG or HTML/CSS diagrams when Mermaid layout would obscure the point.
- Use image generation when a conceptual illustration, polished hero image, mood board, visual
  metaphor, or non-technical asset would help. Prefer Mermaid, SVG, or HTML for exact technical
  diagrams.
- Combine generated images with HTML only when the image adds value beyond decoration.

If the user requested a specific format, use that format unless it would fail the presentation goal.
If the best format is uncertain, state the assumption and proceed with the lowest-cost useful
artifact.

## Build The Artifact

1. Identify the source material: current chat context, selected plan, review findings, code map, or
   user-provided content.
2. Preserve the decision payload: top recommendation, key options, risks, tradeoffs, and next
   question.
3. Design the visual structure around the user's inspection task.
4. Write temporary artifacts to the OS temp directory by default. Use `.local/visualizations/` only
   when the user wants repo-adjacent local state.
5. For HTML, make a standalone file. Tailwind and Mermaid CDNs are acceptable. Keep custom scripts
   minimal and avoid app-style state unless interaction is necessary.
6. For generated images, create or request the image asset first, then embed it in HTML or present
   it alongside the summary.
7. Present the HTML artifact using the presentation surface guidance below.

## Presentation Surface

Keep the artifact local by default. Use the strongest local presentation surface the harness
provides:

- If the harness has a built-in browser or preview surface, present the artifact there. For the
  Codex in-app Browser, use the loopback-server workflow below.
- Otherwise, open the file with the OS opener (`open` on macOS, `xdg-open` on Linux) when the
  environment allows launching it, and always report the absolute `file://` path ready to copy.
- Publish to a hosted artifact surface only when the user explicitly asks; hosting uploads session
  content off the machine. Hosted surfaces typically block remote requests, so inline all CSS and
  JavaScript, embed images as data URIs, and style for both light and dark viewer themes.

### Codex In-App Browser

Prefer a temporary local server over direct `file://` navigation when opening HTML in the Codex
in-app Browser. Browser Use may reject agent-driven `file://` navigation even when the user can open
the same file manually.

1. Start a temporary static server bound to `127.0.0.1` from the directory containing the HTML
   artifact. Use an available high port.
2. Open `http://127.0.0.1:<port>/<artifact-name>.html` in the in-app Browser and make the browser
   visible when the user wants to inspect the artifact.
3. Confirm the page loaded by checking the title, URL, DOM, or screenshot.
4. Stop the temporary server before finishing unless the user explicitly asks to keep it running for
   reloads.
5. If the local server cannot be started, cannot be opened, or cleanup is uncertain, fall back to
   showing the in-app Browser when possible and report the absolute `file://` URL for the user to
   paste manually.

When the server is stopped, the already loaded static page should remain visible, but reloads may
fail. Embed generated images and critical assets directly when the report should survive after
server shutdown.

## HTML Guidance

Make the artifact readable before making it decorative.

- Default to a dark color palette unless the user requests another theme. Use a near-black page
  background, high-contrast text, muted borders, and one or two restrained accent colors.
- Start with the title, generated date, and one-sentence purpose.
- Put the conclusion or top recommendation in the first viewport.
- Use cards only for repeated items such as candidates, options, risks, or timeline events.
- Prefer tables for dense comparisons and diagrams for relationships.
- Make cards, tables, Mermaid containers, and inline diagrams legible on dark surfaces. Avoid light
  panels inside a dark page unless the contrast is intentional and isolated.
- Keep labels short and tied to the user's actual domain language.
- Include enough source references or evidence labels for the artifact to be auditable.
- Avoid turning the report into new analysis; if analysis gaps appear, note them as uncertainties.

## Final Response

Always include:

- What artifact was created, or why no file was needed.
- The absolute path for any generated file.
- A concise Markdown version of the essential conclusion.
- Any assumptions, missing evidence, or follow-up decision the visualization surfaced.

Stop when the requested presentation artifact exists and the user can inspect it, or when the
artifact cannot be created because source material, tool access, or file permissions are missing.
