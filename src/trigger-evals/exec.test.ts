import { describe, expect, it } from "vitest";

import { cliRunError, spawnStreamingCli, type StreamingCliOptions } from "./exec.js";

const node = process.execPath;

function cliOptions(overrides: Partial<StreamingCliOptions> = {}): StreamingCliOptions {
  return {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5_000,
    label: "test cli",
    ...overrides,
  };
}

describe("spawnStreamingCli", () => {
  it("captures output and exit code from a normal run", async () => {
    const result = await spawnStreamingCli(node, ["-e", "console.log('done')"], cliOptions());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("done");
    expect(result.error).toBeUndefined();
  });

  it("remaps an early stop to a successful exit", async () => {
    const result = await spawnStreamingCli(
      node,
      ["-e", "console.log('go'); setInterval(() => {}, 1000);"],
      cliOptions({ stopWhen: (output) => output.stdout.includes("go") }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("reports a timeout when the command outlives timeoutMs", async () => {
    const result = await spawnStreamingCli(
      node,
      ["-e", "setInterval(() => {}, 1000);"],
      cliOptions({ timeoutMs: 300 }),
    );

    expect(result.exitCode).toBeNull();
    expect(result.error).toBe("test cli timed out after 300ms.");
  });

  it("reports an abort when the signal fires mid-run", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = await spawnStreamingCli(
      node,
      ["-e", "setInterval(() => {}, 1000);"],
      cliOptions({ abortSignal: controller.signal }),
    );

    expect(result.error).toBe("test cli aborted.");
  });
});

describe("cliRunError", () => {
  it("returns undefined for a clean zero exit", () => {
    expect(cliRunError({ exitCode: 0, stdout: "", stderr: "" }, "test cli")).toBeUndefined();
  });

  it("describes a nonzero exit", () => {
    expect(cliRunError({ exitCode: 3, stdout: "", stderr: "" }, "test cli")).toBe(
      "test cli exited with code 3.",
    );
  });

  it("prefers the underlying execution error message", () => {
    expect(cliRunError({ exitCode: null, stdout: "", stderr: "", error: "boom" }, "test cli")).toBe(
      "boom",
    );
  });
});
