# Logic Prototype

Use this branch when the question is about business logic, state transitions, data shape, or API
feel: something that looks reasonable on paper but needs to be driven through cases.

## Process

1. Write one paragraph naming the state model and the question being answered.
2. Use the host project's language and tooling. Do not add a new runtime or package manager just for
   the prototype.
3. Put the logic behind a small pure interface that could be lifted into real code later:
   - a reducer when actions are discrete events
   - a state machine when legal actions depend on current state
   - pure functions over plain data when there is no current state
   - a small stateful module only when ongoing internal state is essential
4. Keep the terminal shell disposable. It may import the logic module, but the logic module must not
   depend on terminal I/O, logging, prompts, or escape codes.
5. Render one stable screen after each action: current state first, keyboard shortcuts second.
6. Keep all state in memory unless persistence is the explicit question. If persistence matters, use
   a scratch database or local file clearly marked as prototype data.
7. Add or report one command that runs the prototype.

## Terminal Shape

Render the whole frame on every tick rather than appending scrollback.

- Pretty-print state one field per line or as formatted JSON.
- Use native ANSI escape codes if helpful; avoid dependencies unless the project already has them.
- Read one key or line at a time.
- Dispatch actions through the pure interface.
- Re-render after every action.
- Keep the frame small enough to fit on one screen.

## Anti-Patterns

- Adding tests.
- Wiring the prototype to real production data.
- Generalizing for future possibilities.
- Mixing terminal code into the state model.
- Shipping the terminal shell into production.
