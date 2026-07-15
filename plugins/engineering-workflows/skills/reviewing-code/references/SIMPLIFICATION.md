# Simplification Lane

Ask whether the changed implementation can become locally smaller or clearer without changing its
intended behavior, architecture, or public interface.

Look for:

- reimplementation of existing helpers or local patterns;
- redundant state, repeated computation, unnecessary sequencing, or dead code;
- copy-paste variation, avoidable nesting, and speculative abstraction;
- shallow pass-through wrappers or caller-side policy that can be removed locally;
- names or control flow that obscure an otherwise simple behavior.

Read [FOWLER-SMELLS.md](FOWLER-SMELLS.md), focusing on Mysterious Name, Duplicated Code, Speculative
Generality, Message Chains, and Middle Man.

Keep remedies behavior-preserving and within the changed surface. Route responsibility movement, new
seams, or public-contract changes to codebase-design or API/seam review instead of disguising a
redesign as cleanup.
