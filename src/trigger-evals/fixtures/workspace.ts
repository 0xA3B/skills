import { cp } from "node:fs/promises";
import path from "node:path";

import type { TriggerCase } from "./fixture.js";
import { stageSeededWorkspace, writeWorkspaceFiles } from "./seeds.js";

// One attempt of a case as a relative path: the attempt's artifact directory under the run's
// cases/ directory, its per-attempt runtime directories and workspace, and its runtime release
// scope. Attempts number from 1.
export function caseAttemptKey(caseId: string, attempt: number): string {
  return path.join(caseId, `attempt-${attempt}`);
}

// A case needs its own workspace copy when the fixture mutates it: a seeded git repository, or
// unstaged workspace files. Other cases share the base workspace.
// An empty workspace_files map declares no files, so it needs no per-case copy.
export function needsCaseWorkspace(testCase: TriggerCase): boolean {
  return (
    testCase.workspace !== undefined ||
    (testCase.workspaceFiles !== undefined && Object.keys(testCase.workspaceFiles).length > 0)
  );
}

// Copies the shared base workspace into a case-isolated one, then layers the fixture's workspace:
// a seeded git repository when the case declares one (its harness surfaces join the seed commit),
// and the unstaged workspace files last. Callers that need no per-case mutation should keep using
// the base workspace instead.
export async function stageCaseWorkspace(options: {
  baseWorkspacePath: string;
  workspaceRoot: string;
  repoRoot: string;
  testCase: TriggerCase;
  attempt: number;
}): Promise<string> {
  const { testCase } = options;
  const workspacePath = path.join(
    options.workspaceRoot,
    "cases",
    caseAttemptKey(testCase.id, options.attempt),
    "workspace",
  );
  await cp(options.baseWorkspacePath, workspacePath, { recursive: true });

  if (testCase.workspace === undefined) {
    await writeWorkspaceFiles(workspacePath, testCase.workspaceFiles ?? {});
  } else {
    await stageSeededWorkspace({
      repoRoot: options.repoRoot,
      workspacePath,
      workspace: testCase.workspace,
      ...(testCase.workspaceFiles === undefined ? {} : { workspaceFiles: testCase.workspaceFiles }),
    });
  }

  return workspacePath;
}
