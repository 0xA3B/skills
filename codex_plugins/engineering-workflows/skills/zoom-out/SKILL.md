---
name: zoom-out
description: >-
  Give a broader map of an unfamiliar code area, including relevant modules, callers, workflows, and
  how the area fits into the larger system. Use when the user asks to zoom out, needs orientation,
  or is unfamiliar with a section of code.
license: MIT
metadata:
  original_author: Matt Pocock
  original_source: https://github.com/mattpocock/skills/tree/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/engineering/zoom-out
---

# Zoom Out

Go up a layer of abstraction before diving into implementation details.

## Outcome

Give the user a repository-grounded map of the requested area so they can safely inspect, edit, or
make a planning decision.

## Success Criteria

- The explanation identifies the area's responsibility, main modules, entry points, callers, and
  data or control flow.
- Claims are backed by code or doc references when practical.
- Important conventions, risks, and missing evidence are called out.
- The answer stays oriented toward the user's likely next action.

## Workflow

1. Identify the code area, feature, file, symbol, or behavior the user wants to understand.
2. Inspect the relevant repository structure, callers, tests, docs, and adjacent modules.
3. Use the project's own domain language from `AGENTS.md`, README files, nearby docs, and code
   names.
4. Explain the area as a map:
   - What responsibility this area owns.
   - The main modules and how they relate.
   - The important callers and entry points.
   - The data or control flow through the area.
   - The risks, constraints, or conventions that matter before editing.
5. Keep the explanation oriented toward the user's next action.

Prefer clear code references over broad architectural claims. If the map is uncertain, say what
evidence is missing.

Stop when the map is sufficient for the user's next action. Do not keep expanding into unrelated
areas unless the inspected evidence shows they control the requested behavior.
