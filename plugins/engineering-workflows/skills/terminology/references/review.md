# Review

Use when the user asks whether terminology is complete, consistent, or aligned with code and docs.

## Steps

1. Inspect `AGENTS.md`, README files, nearby docs, code names, and tests relevant to the request.
2. Find missing, vague, overloaded, contradictory, stale, or duplicative terms — including entries
   whose definition restates an installed skill's description or another section of the same file.
3. Cross-check important definitions and relationships against code and tests.
4. Report findings with file references and concrete wording changes.
5. If the user asked for changes or clearly wants the review applied, apply the findings with the
   [Update](update.md) workflow; otherwise leave `AGENTS.md` unchanged.

## Final Response

End with:

- Findings with file references and concrete proposed wording, or the changes applied.
- Ambiguities resolved or still open.

Stop when the review identifies the next terminology decision the user needs to make, or the
requested changes are applied.
