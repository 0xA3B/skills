# Good and bad tests

## Good tests

**Integration-style**: Exercise real code paths through public interfaces and describe what the
system does. Such tests survive refactors because they do not care about private structure.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Give each test one behavioral reason to fail. Use several assertions when they jointly describe one
observable outcome; split the test when failures would represent different behaviors, authorities,
or remedies.

## Bad tests

**Tautological tests**: Recompute the expected result through the same logic as production, so the
assertion cannot disagree with the implementation.

```typescript
// BAD: Expected value repeats the implementation rule
expect(add(a, b)).toBe(a + b);

// GOOD: Expected value comes from a worked example
expect(add(2, 3)).toBe(5);
```

Use a known-good literal, worked example, protocol rule, or specification as the independent source
of truth.

**Framework-guarantee tests**: Re-prove what a library already enforces — unknown keys rejected,
empty strings rejected. Test your composition of the framework's guarantees, not the guarantees
themselves; re-proving them adds volume without adding coverage.

**Implementation-detail tests**: Coupled to internal structure — private methods, internal
collaborators, incidental data shape, or mocks that mirror the current implementation.

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.spyOn(paymentService, "process");
  await checkout(cart, paymentMethod);
  expect(mockPayment).toHaveBeenCalledWith(cart.total);
});
```

Red flags:

- Asserting on call counts/order
- Verifying through external means instead of interface

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Collection-membership tests**: Enumerate the current contents of an extensible collection —
configuration documents, plugins, migrations, fixtures, schemas, templates — so every addition
breaks a test even though membership is not the behavior.

Test the collection's discovery and validation rules with focused examples, and validate the live
collection through a generic command or a dynamically discovered check. Enumerate membership only
when membership itself is the behavior.
