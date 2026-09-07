import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, createApiClient } from "../src/api-client.js";

test("get returns the parsed JSON body", async () => {
  const client = createApiClient({
    baseUrl: "https://inventory.example",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 1 }) }),
  });

  assert.deepEqual(await client.get("/items/1"), { id: 1 });
});

test("get throws ApiError on a non-2xx response", async () => {
  const client = createApiClient({
    baseUrl: "https://inventory.example",
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });

  await assert.rejects(client.get("/items/1"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 503);
    return true;
  });
});
