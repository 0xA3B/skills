import { spawn } from "node:child_process";

export type StreamingCliOutput = {
  stdout: string;
  stderr: string;
};

// How a CLI run ended, so the caller can tell a run that finished naturally from one stopped by
// the stopWhen predicate or cut off by the case timeout.
export type CliEndReason = "completed" | "stop-when" | "timeout" | "abort" | "spawn-error";

export type StreamingCliResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  endedBy: CliEndReason;
  error?: string;
};

export type CliRunResult = {
  exitCode: number | null;
  finalMessage: string;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  finalMessagePath: string;
  endedBy?: CliEndReason;
  error?: string;
};

export function cliRunError(result: StreamingCliResult, label: string): string | undefined {
  if (result.error === undefined && result.exitCode === 0) {
    return undefined;
  }

  return result.error ?? `${label} exited with code ${result.exitCode}.`;
}

export type StreamingCliOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  label: string;
  stopWhen?: (output: StreamingCliOutput) => boolean;
  abortSignal?: AbortSignal;
};

export function spawnStreamingCli(
  command: string,
  args: string[],
  options: StreamingCliOptions,
): Promise<StreamingCliResult> {
  return new Promise((resolve) => {
    let earlyStopped = false;
    const resolveResult = (
      exitCode: number | null,
      endedBy: CliEndReason,
      error?: string,
    ): void => {
      resolve({
        exitCode: earlyStopped ? 0 : exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        endedBy,
        ...(error === undefined ? {} : { error }),
      });
    };

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const maybeStopEarly = (): void => {
      if (earlyStopped || options.stopWhen === undefined) {
        return;
      }
      if (
        options.stopWhen({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        })
      ) {
        earlyStopped = true;
        child.kill("SIGTERM");
      }
    };
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      killSignal: "SIGTERM",
      ...(options.abortSignal === undefined ? {} : { signal: options.abortSignal }),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      maybeStopEarly();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      maybeStopEarly();
    });
    child.on("error", (caught) => {
      const aborted = options.abortSignal?.aborted === true;
      const error = aborted ? `${options.label} aborted.` : caught.message;
      resolveResult(null, aborted ? "abort" : "spawn-error", error);
    });

    child.on("close", (exitCode, signal) => {
      const aborted = options.abortSignal?.aborted === true;
      const timedOut = exitCode === null && signal === "SIGTERM" && !aborted && !earlyStopped;
      const endedBy = aborted
        ? "abort"
        : timedOut
          ? "timeout"
          : earlyStopped
            ? "stop-when"
            : "completed";
      const error = aborted
        ? `${options.label} aborted.`
        : timedOut
          ? `${options.label} timed out after ${options.timeoutMs}ms.`
          : undefined;
      resolveResult(exitCode, endedBy, error);
    });
  });
}
