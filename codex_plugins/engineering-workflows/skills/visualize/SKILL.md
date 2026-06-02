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
- Open a generated local HTML artifact in the Codex in-app Browser when that capability is
  available.
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
7. Open the HTML artifact in the in-app Browser when available. Otherwise, report the absolute path
   and how to open it.

## HTML Guidance

Make the artifact readable before making it decorative.

- Start with the title, generated date, and one-sentence purpose.
- Put the conclusion or top recommendation in the first viewport.
- Use cards only for repeated items such as candidates, options, risks, or timeline events.
- Prefer tables for dense comparisons and diagrams for relationships.
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
