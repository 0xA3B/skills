import { describe, expect, it } from "vitest";

import {
  cliRunError,
  spawnStreamingCli,
  type StreamingCliOptions,
  type StreamingCliOutput,
  type StreamingCliResult,
} from "../../../src/trigger-evals/lanes/exec.js";

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

// Aborts once the child writes "ready" to stderr, which it does after installing its SIGTERM
// handler, so the signal cannot reach a child still starting up. The marker must lead stderr:
// earlier output, such as a startup warning, cannot trigger the abort early. spawnStreamingCli
// exposes live output only through stopWhen, so this predicate aborts as a side effect and never
// stops the run.
function abortWhenReady(controller: AbortController): (output: StreamingCliOutput) => boolean {
  return (output) => {
    if (output.stderr.startsWith("ready")) {
      controller.abort();
    }
    return false;
  };
}

describe("spawnStreamingCli", () => {
  it("captures output and exit code from a normal run", async () => {
    const result = await spawnStreamingCli(node, ["-e", "console.log('done')"], cliOptions());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("done");
    expect(result.endedBy).toBe("completed");
    expect(result.error).toBeUndefined();
  });

  it("remaps an early stop to a successful exit", async () => {
    const result = await spawnStreamingCli(
      node,
      ["-e", "console.log('go'); setInterval(() => {}, 1000);"],
      cliOptions({ stopWhen: (output) => output.stdout.includes("go") }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.endedBy).toBe("stop-when");
    expect(result.error).toBeUndefined();
  });

  it("reports a timeout when the command outlives timeoutMs", async () => {
    const result = await spawnStreamingCli(
      node,
      ["-e", "setInterval(() => {}, 1000);"],
      cliOptions({ timeoutMs: 300 }),
    );

    expect(result.exitCode).toBeNull();
    expect(result.endedBy).toBe("timeout");
    expect(result.error).toBe("test cli timed out after 300ms.");
  });

  it("reports a spawn error when the command cannot start", async () => {
    const result = await spawnStreamingCli("./no-such-command", [], cliOptions());

    expect(result.exitCode).toBeNull();
    expect(result.endedBy).toBe("spawn-error");
    expect(result.error).toContain("ENOENT");
  });

  it("resolves an aborted run only after the child has exited", async () => {
    const controller = new AbortController();

    // The child answers SIGTERM by writing a marker before it exits; the marker is in the
    // result only when the result waited for the close event.
    const result = await spawnStreamingCli(
      node,
      [
        "-e",
        "process.on('SIGTERM', () => { process.stdout.write('closing'); process.exit(0); }); process.stderr.write('ready'); setInterval(() => {}, 1000);",
      ],
      cliOptions({ abortSignal: controller.signal, stopWhen: abortWhenReady(controller) }),
    );

    expect(result.endedBy).toBe("abort");
    expect(result.stdout).toBe("closing");
  });

  it("escalates to SIGKILL when an aborted child ignores SIGTERM", async () => {
    const controller = new AbortController();

    // Without the escalation the child outlives the run and the test fails on its timeout.
    const result = await spawnStreamingCli(
      node,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stderr.write('ready'); setInterval(() => {}, 1000);",
      ],
      cliOptions({
        abortSignal: controller.signal,
        abortGraceMs: 200,
        stopWhen: abortWhenReady(controller),
      }),
    );

    expect(result.endedBy).toBe("abort");
    expect(result.error).toBe("test cli aborted.");
  });
});

describe("cliRunError", () => {
  it.each<[string, Omit<StreamingCliResult, "stdout" | "stderr">, string | undefined]>([
    ["returns undefined for a clean zero exit", { exitCode: 0, endedBy: "completed" }, undefined],
    [
      "describes a nonzero exit",
      { exitCode: 3, endedBy: "completed" },
      "test cli exited with code 3.",
    ],
    [
      "prefers the underlying execution error message",
      { exitCode: null, endedBy: "spawn-error", error: "boom" },
      "boom",
    ],
  ])("%s", (_name, result, expected) => {
    expect(cliRunError({ stdout: "", stderr: "", ...result }, "test cli")).toBe(expected);
  });
});
