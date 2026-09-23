import { rm } from "node:fs/promises";

// The runtime state a trigger eval creates and owes back to the machine: staged workspace roots
// under the OS temporary directory and Codex homes under the run directory. Lanes track each
// directory they create; the runner releases them so one owner decides ordering, retention, and
// what a failed removal does to the run. Durable artifacts (report.json, per-case events.jsonl,
// final.txt, stderr.log) are never tracked here.
export type RuntimeResources = {
  // Registers a directory to remove on release. The optional scope groups a case's directories so
  // they can be released as soon as that case has captured its output. Returns the path.
  track(directoryPath: string, scope?: string): string;
  // Removes the tracked directories in the named scope, or every remaining directory when no
  // scope is given, newest first. Never throws: a directory that could not be removed is reported
  // as a message so a cleanup problem cannot hide the eval result or the error that ended the run.
  release(scope?: string): Promise<string[]>;
};

export type RuntimeResourcesOptions = {
  // Retain every tracked directory for debugging; the copied Codex auth is removed regardless by
  // the lane that copied it.
  keep?: boolean;
};

export function createRuntimeResources(options: RuntimeResourcesOptions = {}): RuntimeResources {
  const tracked: Array<{ directoryPath: string; scope: string | undefined }> = [];
  const keep = options.keep === true;

  return {
    track(directoryPath, scope) {
      tracked.push({ directoryPath, scope });
      return directoryPath;
    },
    async release(scope) {
      const failures: string[] = [];
      for (let index = tracked.length - 1; index >= 0; index -= 1) {
        const entry = tracked[index];
        if (entry === undefined || (scope !== undefined && entry.scope !== scope)) {
          continue;
        }
        tracked.splice(index, 1);
        if (keep) {
          continue;
        }
        try {
          await rm(entry.directoryPath, { recursive: true, force: true });
        } catch (caught) {
          failures.push(
            `${entry.directoryPath}: ${caught instanceof Error ? caught.message : String(caught)}`,
          );
        }
      }
      return failures;
    },
  };
}
