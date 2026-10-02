import { cp } from "node:fs/promises";
import path from "node:path";

import type { TriggerCase } from "./fixture.js";
import { stageSeededWorkspace, writeWorkspaceFiles } from "./seeds.js";

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
}): Promise<string> {
  const { testCase } = options;
  const workspacePath = path.join(options.workspaceRoot, "cases", testCase.id, "workspace");
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
