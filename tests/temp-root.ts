import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll } from "vitest";

// Every temporary directory a test file creates, through mkdtemp in a test or in the code under
// test, lands under one root that is removed when the file finishes. Tests therefore create temp
// directories without cleaning them up, including directories a test deliberately retains, such
// as a runtime released with keep. os.tmpdir() reads TMPDIR on every call, so pointing TMPDIR at
// the root redirects them; child processes inherit it.
const previousTmpdir = process.env["TMPDIR"];
const root = await mkdtemp(path.join(os.tmpdir(), "vitest-"));
process.env["TMPDIR"] = root;

afterAll(async () => {
  if (previousTmpdir === undefined) {
    delete process.env["TMPDIR"];
  } else {
    process.env["TMPDIR"] = previousTmpdir;
  }
  await rm(root, { force: true, recursive: true });
});
