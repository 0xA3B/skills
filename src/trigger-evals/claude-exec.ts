import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { spawnStreamingCli, type StreamingCliOutput } from "./exec.js";

type ClaudeRunOptions = {
  workspacePath: string;
  pluginDir?: string;
  prompt: string;
  caseDir: string;
  timeoutMs: number;
  model: string;
  effort: string;
  stopWhen?: (output: StreamingCliOutput) => boolean;
  configDir?: string;
  abortSignal?: AbortSignal;
};

export type ClaudeRunResult = {
  exitCode: number | null;
  finalMessage: string;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  finalMessagePath: string;
  error?: string;
};

// Read-only tool surface: trigger evals only observe whether the Skill tool fires, but the model
// may need to inspect fixture workspace files before deciding.
const EVAL_TOOLS = "Skill,Read,Glob,Grep";

export async function runClaudeExec(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  await mkdir(options.caseDir, { recursive: true });
  const stdoutPath = path.join(options.caseDir, "events.jsonl");
  const stderrPath = path.join(options.caseDir, "stderr.log");
  const finalMessagePath = path.join(options.caseDir, "final.txt");

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "dontAsk",
    "--tools",
    EVAL_TOOLS,
    "--setting-sources",
    "project",
    "--model",
    options.model,
    "--effort",
    options.effort,
  ];

  if (options.pluginDir !== undefined) {
    args.push("--plugin-dir", options.pluginDir);
  }

  args.push(options.prompt);

  const result = await spawnStreamingCli("claude", args, {
    cwd: options.workspacePath,
    env: {
      ...process.env,
      ...(options.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: options.configDir }),
    },
    timeoutMs: options.timeoutMs,
    label: "claude -p",
    ...(options.stopWhen === undefined ? {} : { stopWhen: options.stopWhen }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
  });

  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);

  const finalMessage = parseResultText(result.stdout);
  await writeFile(finalMessagePath, finalMessage);

  const baseResult = {
    exitCode: result.exitCode,
    finalMessage,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutPath,
    stderrPath,
    finalMessagePath,
  };

  if (result.error === undefined && result.exitCode === 0) {
    return baseResult;
  }

  return {
    ...baseResult,
    error: result.error ?? `claude -p exited with code ${result.exitCode}.`,
  };
}

function parseResultText(stdout: string): string {
  let finalMessage = "";
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as { type?: string; result?: unknown };
      if (parsed.type === "result" && typeof parsed.result === "string") {
        finalMessage = parsed.result;
      }
    } catch {
      // Ignore non-event output.
    }
  }

  return finalMessage;
}
