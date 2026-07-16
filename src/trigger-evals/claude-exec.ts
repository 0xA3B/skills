import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CliRunResult,
  cliRunError,
  spawnStreamingCli,
  type StreamingCliOutput,
} from "./exec.js";
import { isRecord, parseJsonlEvents } from "./json.js";

type ClaudeRunOptions = {
  workspacePath: string;
  pluginDirs?: string[];
  prompt: string;
  caseDir: string;
  timeoutMs: number;
  model: string;
  effort: string;
  stopWhen?: (output: StreamingCliOutput) => boolean;
  configDir?: string;
  abortSignal?: AbortSignal;
};

// Read-only tool surface: trigger evals only observe whether the Skill tool fires, but the model
// may need to inspect fixture workspace files before deciding.
const EVAL_TOOLS = "Skill,Read,Glob,Grep";

export async function runClaudeExec(options: ClaudeRunOptions): Promise<CliRunResult> {
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

  for (const pluginDir of options.pluginDirs ?? []) {
    args.push("--plugin-dir", pluginDir);
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

  const error = cliRunError(result, "claude -p");
  return {
    exitCode: result.exitCode,
    finalMessage,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutPath,
    stderrPath,
    finalMessagePath,
    endedBy: result.endedBy,
    ...(error === undefined ? {} : { error }),
  };
}

function parseResultText(stdout: string): string {
  let finalMessage = "";
  for (const event of parseJsonlEvents(stdout)) {
    if (isRecord(event) && event["type"] === "result" && typeof event["result"] === "string") {
      finalMessage = event["result"];
    }
  }

  return finalMessage;
}
