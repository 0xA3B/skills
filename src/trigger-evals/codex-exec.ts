import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { spawnStreamingCli } from "./exec.js";

type CodexRunOptions = {
  codexHome: string;
  workspacePath: string;
  prompt: string;
  caseDir: string;
  timeoutMs: number;
  sandboxMode: "read-only" | "workspace-write";
  stopWhen?: (output: { stdout: string; stderr: string }) => boolean;
  abortSignal?: AbortSignal;
};

export type CodexRunResult = {
  exitCode: number | null;
  finalMessage: string;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  finalMessagePath: string;
  error?: string;
};

export async function runCodexExec(options: CodexRunOptions): Promise<CodexRunResult> {
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
    error: result.error ?? `codex exec exited with code ${result.exitCode}.`,
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
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message") {
        finalMessage = parsed.item.text ?? "";
      }
    } catch {
      // Ignore non-event output.
    }
  }

  return finalMessage;
}
