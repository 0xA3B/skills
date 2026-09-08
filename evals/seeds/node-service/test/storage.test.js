import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryStorage } from "../src/storage.js";

test("stores and retrieves items by id", () => {
  const storage = createMemoryStorage();

  storage.set("a", { name: "first" });

  assert.deepEqual(storage.get("a"), { name: "first" });
  assert.deepEqual(storage.list(), [{ name: "first" }]);
});

test("delete reports whether an item existed", () => {
  const storage = createMemoryStorage();
  storage.set("a", {});

  assert.equal(storage.delete("a"), true);
  assert.equal(storage.delete("a"), false);
});
