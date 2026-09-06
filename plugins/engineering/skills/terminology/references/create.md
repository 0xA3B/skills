# Create

## Steps

1. Identify stable domain concepts from the conversation and repository evidence.
2. Add `## Terminology` to `AGENTS.md` using the template below. Include the section introduction
   and the terms table; include relationships when they clarify ownership, lifecycle, or
   cardinality.
3. Keep the first version small; defer uncertain or contested terms.

## Section template

```md
## Terminology

Use this section for durable domain terms that should guide future work in this repository. Add or
update entries when a term becomes stable during adversarial review, architecture review, or
implementation.

| Term        | Definition                                     | Aliases to Avoid |
| ----------- | ---------------------------------------------- | ---------------- |
| **Example** | A stable domain concept in one tight sentence. | stale alias      |

Relationships:

- An **Example** owns zero or more **Related Examples**.
```

## Final response

End with:

- Terms included and terms intentionally deferred as not yet stable.
- Files updated.

Stop when `AGENTS.md` has a terminology section that captures the stable terms and defers the
contested ones.
