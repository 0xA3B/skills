import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRuntimeResources } from "../../src/trigger-evals/runtime.js";
import { exists } from "./test-utils.js";

async function makeDir(parent: string, name: string): Promise<string> {
  const dirPath = path.join(parent, name);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

describe("createRuntimeResources", () => {
  it("removes every tracked path on release", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-resources-"));
    const runtime = createRuntimeResources();
    const runDir = runtime.track(await makeDir(root, "run"));
    const workspace = runtime.track(await makeDir(root, "workspace"));

    await expect(runtime.release()).resolves.toStrictEqual([]);

    expect(await exists(runDir)).toBe(false);
    expect(await exists(workspace)).toBe(false);
  });

  it("releases only the named scope and leaves run-scoped paths in place", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-resources-"));
    const runtime = createRuntimeResources();
    const runDir = runtime.track(await makeDir(root, "run"));
    const caseA = runtime.track(await makeDir(root, "case-a"), "case-a");
    const caseB = runtime.track(await makeDir(root, "case-b"), "case-b");

    await expect(runtime.release("case-a")).resolves.toStrictEqual([]);

    expect(await exists(caseA)).toBe(false);
    expect(await exists(caseB)).toBe(true);
    expect(await exists(runDir)).toBe(true);

    // An unscoped release removes whatever remains, including other cases' leftovers.
    await runtime.release();
    expect(await exists(caseB)).toBe(false);
    expect(await exists(runDir)).toBe(false);
  });

  it("keeps every tracked path when retention is requested", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-resources-"));
    const runtime = createRuntimeResources({ keep: true });
    const runDir = runtime.track(await makeDir(root, "run"));
    const caseDir = runtime.track(await makeDir(root, "case-a"), "case-a");

    await expect(runtime.release("case-a")).resolves.toStrictEqual([]);
    await expect(runtime.release()).resolves.toStrictEqual([]);

    expect(await exists(runDir)).toBe(true);
    expect(await exists(caseDir)).toBe(true);
  });

  it("reports a path it could not remove once instead of throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "runtime-resources-"));
    const lockedParent = await makeDir(root, "locked");
    const stuck = await makeDir(lockedParent, "stuck");
    const runtime = createRuntimeResources();
    runtime.track(stuck, "case-a");
    runtime.track(await makeDir(root, "free"));

    await chmod(lockedParent, 0o555);
    try {
      const failures = await runtime.release("case-a");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain(stuck);
      // The failed path is forgotten, so the run's final release does not report it again.
      await expect(runtime.release()).resolves.toStrictEqual([]);
      expect(await exists(path.join(root, "free"))).toBe(false);
    } finally {
      await chmod(lockedParent, 0o755);
    }
  });
});
