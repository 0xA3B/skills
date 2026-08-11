# Logic prototype

Build a single self-contained HTML file — a shareable demo — that lets anyone drive the state model
by clicking buttons. One file with nothing to install means a non-developer — a designer, a PM, a
domain expert — can open it and feel the model for themselves, so the demo speaks their language,
not the code's.

## Process

1. Write one paragraph naming the state model and the question being answered, and render it as a
   visible intro at the top of the demo, not only a comment.
2. Isolate the logic that answers the question in one `<script>` block written as a small pure
   module — a disposable model of the behavior the real implementation will rebuild:
   - a reducer when actions are discrete events;
   - a state machine when legal actions depend on current state;
   - pure functions over plain data when there is no current state;
   - a small stateful module only when ongoing internal state is essential.
3. Keep the module pure: no DOM access, no button handlers reaching inside it. The page calls into
   the module; nothing flows the other direction. The purity keeps the demo's answer about the
   behavior itself, not the DOM wiring.
4. Keep everything in the one file: plain HTML, CSS, and JavaScript inline, with no framework,
   bundler, or server, so the demo opens by double-click and survives being shared.
5. Write every label in domain language, not code: buttons and state read like the business, not
   like the reducer.
6. Keep all state in memory unless persistence is the explicit question. If persistence matters, use
   a scratch database or local file clearly marked as prototype data.

## Page shape

Lay the page out top to bottom:

1. **Title and one-line explanation** of what the demo lets the reader explore — the question from
   step 1.
2. **Current state**, rendered as a readable panel with labelled fields rather than a raw JSON dump,
   re-rendered after every click so the change is visible. Call out what just changed where that
   helps a non-developer follow.
3. **Free-play buttons**, one per action and always available, so anyone can poke at the model in
   any order.
4. **Guided walkthroughs**: one scenario per tab, each holding a short plain-language description of
   the situation it sets up and what to watch for, followed by the ordered buttons to press. Each
   step is a real button that performs its action and advances the walkthrough. Starting a
   walkthrough resets to a known initial state so the scenario runs the same way every time.

Choose scenarios that demonstrate the awkward cases — the happy path, a tricky edge case, an attempt
at something that should be illegal — the ones hard to reason about on paper. Keep the styling
restrained: clean typography, generous spacing, one accent colour, no animation competing with the
state and the buttons.

## When done

The interesting moments are when the reader says "wait, that shouldn't be possible" — those are bugs
in the idea, which is the point. Add actions or scenarios they ask for. When the demo has answered
its question, capture the question, evidence, and decision through the handoff the skill body
defines — the validated behavior, the states and transitions the module demonstrated, not its code.
The whole demo, module included, stays disposable; the recommended build or tdd workflow implements
the behavior fresh.
