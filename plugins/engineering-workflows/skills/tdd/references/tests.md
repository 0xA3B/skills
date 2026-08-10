# Good and bad tests

## Good tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Keep one logical assertion per test.

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

**Implementation-detail tests**: Coupled to internal structure.

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.spyOn(paymentService, "process");
  await checkout(cart, paymentMethod);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
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
