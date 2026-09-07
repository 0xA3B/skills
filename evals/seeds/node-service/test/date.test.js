import assert from "node:assert/strict";
import { test } from "node:test";

import { parseIso } from "../src/date.js";

test("parses a timestamp with a numeric offset", () => {
  assert.deepEqual(parseIso("2026-03-04T05:06:07+02:00"), {
    year: 2026,
    month: 3,
    day: 4,
    hour: 5,
    minute: 6,
    second: 7,
    offset: "+02:00",
  });
});

test("returns null for a non-ISO string", () => {
  assert.equal(parseIso("yesterday"), null);
});
