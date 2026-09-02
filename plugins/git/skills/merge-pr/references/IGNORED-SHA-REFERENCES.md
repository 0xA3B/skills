# Ignored SHA references

Use this reference only after a rebase or squash merge when ignored, untracked local artifacts
contain recorded references to original topic commits.

Update an ignored file only when all of these hold:

- it is ignored and untracked at cleanup time;
- the old token resolves to exactly one original topic commit;
- the old and new commits have a verified one-to-one patch identity in the change-request and target
  context;
- replacement changes only the exact SHA token;
- reading the file back proves no stale mapped token remains.

Accept an abbreviated SHA only when it resolves unambiguously. Do not guess after squash, duplicate
patches, empty commits, concurrent target changes, or unavailable original objects. Leave ambiguous
references unchanged and report them. Never rewrite tracked, non-ignored untracked, or published
durable artifacts.
