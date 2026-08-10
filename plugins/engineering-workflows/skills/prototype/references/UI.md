# UI prototype

## Preferred shape

Prefer variants inside a realistic existing page when possible. A prototype judged next to real
navigation, density, auth, data, and constraints gives better evidence than an isolated empty route.

Use a new throwaway route only when the surface has no sensible existing host. Host the existing
page from a detached `.local/worktrees/<slug>/` worktree (`SKILL.md ## Placement`, item 2) so the
main checkout stays clean; use source-adjacent files only when the framework cannot host the
experiment from a worktree.

## Process

1. State the plan in one line: how many variants, which route or host page, and the `?variant=`
   switch.
2. Default to three variants. Cap at five.
3. Make variants structurally different: layout, hierarchy, primary affordance, or workflow. Changes
   only to color, spacing, or copy do not count as variants.
4. Keep existing data fetching, params, auth, and app shell when using an existing page. Swap only
   the rendered subtree and keep every mutation off production data.
5. Add a floating bottom-center switcher with previous/next controls, a current variant label, and
   `Left`/`Right` keyboard navigation.
6. Update the URL search param when switching so the variant is shareable and reload-stable.
7. Hide prototype-only switcher UI in production builds when the code is source-adjacent.
8. Give the user the URL and variant keys.

## Switcher rules

- Do not intercept arrow keys while an input, textarea, select, or contenteditable element is
  focused.
- Keep the switcher visually distinct from the design being evaluated.
- Use the framework router instead of manual location mutation when a router exists.
- Keep the switcher shared within the prototype, but do not over-share layout code between variants.

## Cleanup

When a direction wins, delete every losing variant, the switcher, and any prototype route, then
carry the chosen direction into the handoff described in `SKILL.md ## Completion`. The winning
direction is rebuilt in the implementation workflow, not here.
