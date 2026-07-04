# UI Prototype

Use this branch when the question is visual direction: layout, information hierarchy, interaction
shape, or choosing between design approaches.

## Preferred Shape

Prefer variants inside a realistic existing page when possible. A prototype judged next to real
navigation, density, auth, data, and constraints gives better evidence than an isolated empty route.

Use a new throwaway route only when the surface has no sensible existing host.

## Process

1. State the plan in one line: how many variants, which route or host page, and the `?variant=`
   switch.
2. Default to three variants. Cap at five.
3. Make variants structurally different: layout, hierarchy, primary affordance, or workflow. Do not
   count color-only changes as variants.
4. Keep existing data fetching, params, auth, and app shell when using an existing page. Swap only
   the rendered subtree.
5. Add a floating bottom-center switcher with previous/next controls, a current variant label, and
   `Left`/`Right` keyboard navigation.
6. Update the URL search param when switching so the variant is shareable and reload-stable.
7. Hide prototype-only switcher UI in production builds when the code is source-adjacent.
8. Give the user the URL and variant keys.

## Switcher Rules

- Do not intercept arrow keys while an input, textarea, select, or contenteditable element is
  focused.
- Keep the switcher visually distinct from the design being evaluated.
- Use the framework router instead of manual location mutation when a router exists.
- Keep the switcher shared within the prototype, but do not over-share layout code between variants.

## Cleanup

When a direction wins:

- For an existing page, delete losing variants and the switcher, then rebuild the winning direction
  properly.
- For a throwaway route, promote the chosen direction into the real route and delete the prototype
  route.

## Anti-Patterns

- Variants that differ only in color, spacing, or copy.
- A shared layout that makes all variants structurally identical.
- Real mutations against production data.
- Promoting prototype code directly to production without rewriting it under normal quality rules.
