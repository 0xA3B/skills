import assert from "node:assert/strict";
import { test } from "node:test";

import { listItems } from "../src/list-endpoint.js";
import { createMemoryStorage } from "../src/storage.js";

function storageWith(count) {
  const storage = createMemoryStorage();
  for (let index = 1; index <= count; index += 1) {
    storage.set(String(index), { id: index });
  }
  return storage;
}

test("returns the first page of twenty items by default", () => {
  const result = listItems(storageWith(25));

  assert.equal(result.items.length, 20);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.equal(result.total, 25);
});

test("returns the remainder on the last page", () => {
  const result = listItems(storageWith(25), { page: 2 });

  assert.deepEqual(
    result.items.map((item) => item.id),
    [21, 22, 23, 24, 25],
  );
});
