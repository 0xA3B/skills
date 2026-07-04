import { spawn } from "node:child_process";

export type StreamingCliOutput = {
  stdout: string;
  stderr: string;
};

export type StreamingCliResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

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
    const resolveResult = (exitCode: number | null, error?: string): void => {
      resolve({
        exitCode: earlyStopped ? 0 : exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
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
      const error =
        options.abortSignal?.aborted === true ? `${options.label} aborted.` : caught.message;
      resolveResult(null, error);
    });

    child.on("close", (exitCode, signal) => {
      const aborted = options.abortSignal?.aborted === true;
      const timedOut = exitCode === null && signal === "SIGTERM" && !aborted && !earlyStopped;
      const error = aborted
        ? `${options.label} aborted.`
        : timedOut
          ? `${options.label} timed out after ${options.timeoutMs}ms.`
          : undefined;
      resolveResult(exitCode, error);
    });
  });
}
