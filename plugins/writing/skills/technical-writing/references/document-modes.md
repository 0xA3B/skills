# Document modes

Diátaxis gives every technical document one of four modes. One document serves one mode; a document
that mixes modes serves no reader well. Two questions pick the mode: does the content inform action
(doing) or understanding (thinking), and does it serve learning or work?

- Action and learning: **tutorial**.
- Action and work: **how-to**.
- Understanding and work: **reference**.
- Understanding and learning: **explanation**.

Apply the two questions to a whole document or to one paragraph. Reach for them whenever you are
unsure what you are writing; gut feel is often wrong here.

## Tutorial: learning by doing

You are the teacher, and the learner's success is your responsibility. Open with what the learner
will build, not what they will "learn". Make every step produce a visible result, early and often,
and tell the learner what they should see: the expected output, the prompt change, the log line.
Keep explanation to one clause and a link; a teaching pause breaks the lesson. Stay concrete, write
as "we", and give steps as commands: "First, run x. Now, run y."

## How-to: steps to a goal

Solve a problem the reader has, not an operation the machine can perform. Assume competence and skip
teaching: action only, with background linked instead of included. Forks and judgment are allowed:
"If you want x, do y." Name the guide by the task with a bare command verb, the same heading form
[formatting.md](formatting.md) requires: "Calibrate the radar array", not "Radar array calibration".

## Reference: facts for lookup

Describe, and only describe: no instruction, no persuasion, no opinion. Be dry, complete, and sure.
State facts, options, limits, and errors without hedging. Mirror the structure of the thing
described, so the reader can navigate code and docs together. Generate from code where possible, so
the document stays true.

## Explanation: understanding and why

Cover one bounded topic that is readable away from the product; each title should tolerate an
implicit "About ..." in front. Anchor on a real why question. Give context: design decisions,
history, constraints, and alternatives. Opinion is allowed here and nowhere else.

## Keep modes apart

Do not put reference tables inside a tutorial, tutorial hand-holding inside reference, or argument
inside a how-to. Split the document and link between the parts instead.

A gateway document such as a README combines modes by design. Apply the mode rules to each of its
sections instead of the whole file, and follow the README content model in [readme.md](readme.md)
for what the sections are.

Source: diataxis.fr.
