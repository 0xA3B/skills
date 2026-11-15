# Update

## Steps

1. In every `AGENTS.md` of the repository, rename a section named `## Terminology` to
   `## Ubiquitous language`, and replace its opening lines with the usage contract in
   [create.md](create.md). Other skills find the section by the new heading. Leave links to the old
   heading in other files to the user, and list them in the final response.
2. If the section holds its terms in one or more tables, convert each table to the list form in the
   `SKILL.md` section structure, keeping each group's subheading and each term, definition, and
   alias unchanged.
3. Compare the proposed language with the existing entries.
4. Add or revise only terms that are stable enough to guide future work, and remove terms the
   repository no longer uses or that no longer resolve a confusion.
5. Resolve synonyms by choosing one canonical term and listing aliases to avoid.
6. Resolve overloaded words by splitting concepts or flagging the ambiguity in the relevant
   definition.
7. Update relationships when they clarify ownership, lifecycle, or cardinality.
8. When an added or changed term is spoken in only one bounded context, place it as the `SKILL.md`
   bounded-context rules direct.

## Final response

End with:

- Terms added, changed, moved between files, or intentionally deferred.
- The section rename and the table conversion, when either happened.
- Ambiguities resolved or still open.
- Files updated.

Stop when the section reflects the stable language and any remaining ambiguities are reported.
