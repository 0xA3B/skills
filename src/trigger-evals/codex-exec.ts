import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CliRunResult,
  cliRunError,
  spawnStreamingCli,
  type StreamingCliOutput,
} from "./exec.js";
import { isRecord, parseJsonlEvents } from "./json.js";

type CodexRunOptions = {
  codexHome: string;
  workspacePath: string;
  prompt: string;
  caseDir: string;
  timeoutMs: number;
  sandboxMode: "read-only" | "workspace-write";
  stopWhen?: (output: StreamingCliOutput) => boolean;
  abortSignal?: AbortSignal;
};

export async function runCodexExec(options: CodexRunOptions): Promise<CliRunResult> {
  await mkdir(options.caseDir, { recursive: true });
  const stdoutPath = path.join(options.caseDir, "events.jsonl");
  const stderrPath = path.join(options.caseDir, "stderr.log");
  const finalMessagePath = path.join(options.caseDir, "final.txt");

  const args = [
    "-a",
    "never",
    "-s",
    options.sandboxMode,
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--color",
    "never",
    "-C",
    options.workspacePath,
    "-o",
    finalMessagePath,
  ];

  args.push("--", options.prompt);

  const result = await spawnStreamingCli("codex", args, {
    cwd: options.workspacePath,
    env: { ...process.env, CODEX_HOME: options.codexHome },
    timeoutMs: options.timeoutMs,
    label: "codex exec",
    ...(options.stopWhen === undefined ? {} : { stopWhen: options.stopWhen }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
  });

  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);

  const finalMessage = await readFinalMessage(finalMessagePath, result.stdout);
  const error = cliRunError(result, "codex exec");
  return {
    exitCode: result.exitCode,
    finalMessage,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutPath,
    stderrPath,
    finalMessagePath,
    ...(error === undefined ? {} : { error }),
  };
}

async function readFinalMessage(finalMessagePath: string, stdout: string): Promise<string> {
  try {
    return await readFile(finalMessagePath, "utf8");
  } catch {
    return parseLastAgentMessage(stdout);
  }
}

function parseLastAgentMessage(stdout: string): string {
  let finalMessage = "";
  for (const event of parseJsonlEvents(stdout)) {
    if (!isRecord(event) || event["type"] !== "item.completed") {
      continue;
    }

    const item = event["item"];
    if (isRecord(item) && item["type"] === "agent_message") {
      finalMessage = typeof item["text"] === "string" ? item["text"] : "";
    }
  }

  return finalMessage;
}
