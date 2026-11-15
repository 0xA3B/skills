# Create

## Steps

1. Identify stable domain concepts from the conversation and repository evidence.
2. Add `## Ubiquitous language` to `AGENTS.md` using the template below. Include the usage contract
   and the term list; include relationships when they clarify ownership, lifecycle, or cardinality.
3. Keep the first version small; defer uncertain or contested terms.

## Section template

```md
## Ubiquitous language

Use these terms, with these meanings, in conversation, code, tests, and documents. When a request,
or code the task changes, uses an alias to avoid or uses a term with a different meaning, say so
before you continue. Change this section through `engineering:ubiquitous-language`.

- **Example**: A stable domain concept in one tight sentence. Aliases to avoid: stale alias.

Relationships:

- An **Example** owns zero or more **Related Examples**.
```

The three sentences above the list are the usage contract. In a nested `AGENTS.md`, keep them and
scope the first to the directory: "While you work under `<directory>`, use these terms ...".

## Final response

End with:

- Terms included and terms intentionally deferred as not yet stable.
- Files updated.

Stop when `AGENTS.md` has a ubiquitous language section that captures the stable terms and defers
the contested ones.
