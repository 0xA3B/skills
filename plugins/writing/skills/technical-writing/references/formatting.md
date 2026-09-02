# Formatting and layout

Formatting rules in the spirit of the Google developer documentation style guide. These rules govern
document structure; the wording inside any sentence follows `SKILL.md`, and `SKILL.md` wins when the
two conflict on a sentence.

## Headings

- Use sentence case.
- Start a task heading with a bare command verb: "Create an instance", not "Creating an instance"
  and not "How to create an instance".
- Do not skip heading levels.
- Put body text between a heading and its first subheading; do not stack headings.

## Document flow

- Lead the document and each section with the point: what it is and why the reader cares, before
  steps or detail.
- Replace vague temporal words with a named version, date, phase, or lifecycle state. Use temporal
  language when a migration, rollout, or deprecation phase changes the instructions.

## Lists

- Use a numbered list when order matters; use a bulleted list otherwise.
- Introduce a list with a full sentence that ends in a colon.
- Make list items parallel in structure. When items are full sentences, capitalize them and end them
  with a period; otherwise do neither.

## Tables

- Use a table for facts that share the same attributes across rows. Use prose or a list otherwise.
- Keep cells short. Put explanation in the surrounding prose, not in the cells.
- Give every table a header row.

## Links

- Make link text name the destination: "see the configuration reference", never "here" or "click
  here".
- Link the first mention of a resource in a section, not every mention.

## Code samples

- Introduce each code block with a sentence that states what it does or shows.
- Annotate each fence with its language.
- Put a command and its output in separate blocks.
- Mark placeholders in one consistent form, for example `PROJECT_ID`, and define each placeholder
  near its first use.
- Make every command run as pasted once placeholders are replaced. State prerequisites before the
  command that needs them.

## Notices

- Put a note, warning, or caution before the content it affects.
- Use one notice at a time; do not stack notices.
- Reserve warnings for damage or data loss; use notes for useful asides.

## Images

- Write alt text that states the information in the image, not "screenshot".
- Prefer text — a code block or a table — over an image of text.
