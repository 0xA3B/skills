import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = import.meta.dirname;

export type Snapshot = Record<string, unknown>;
export type Scenario = { snapshots: Snapshot[] };

export function pollScript(name: string): string {
  return path.resolve(here, "../../plugins/git/skills/address-pr-feedback/scripts", name);
}

export async function recorded(fixture: string): Promise<Scenario> {
  return JSON.parse(await readFile(path.join(here, "fixtures", fixture), "utf8"));
}

// Runs a poll script against the fake gh. The stub sleep advances the scenario one snapshot.
export async function replay(
  script: string,
  scenario: Scenario,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string }> {
  const work = await mkdtemp(path.join(tmpdir(), "poll-replay-"));
  try {
    const bin = path.join(work, "bin");
    await mkdir(bin);
    await writeFile(path.join(work, "scenario.json"), JSON.stringify(scenario));
    await writeFile(
      path.join(bin, "gh"),
      `#!/bin/sh\nexec node "${path.join(here, "fake-gh.mjs")}" "$@"\n`,
    );
    await writeFile(
      path.join(bin, "sleep"),
      '#!/bin/sh\nn=$(cat "$FAKE_GH_DIR/clock" 2>/dev/null || echo 0)\necho $((n + 1)) >"$FAKE_GH_DIR/clock"\n',
    );
    await chmod(path.join(bin, "gh"), 0o755);
    await chmod(path.join(bin, "sleep"), 0o755);
    const { ACK_POLLS: _ackPolls, FAKE_GH_REAL: _real, ...env } = process.env;
    try {
      const { stdout } = await execFileAsync(script, args, {
        env: {
          ...env,
          FAKE_GH_DIR: work,
          PATH: `${bin}${path.delimiter}${env["PATH"] ?? ""}`,
          REPO: "0xA3B/skills",
          ...extraEnv,
        },
      });
      return { exitCode: 0, stdout };
    } catch (caught: unknown) {
      const failure = caught as { code: number; stdout: string; stderr: string };
      return { exitCode: failure.code, stdout: failure.stdout + failure.stderr };
    }
  } finally {
    await rm(work, { force: true, recursive: true });
  }
}

// Runs a poll script with an empty PATH, so it finds neither gh nor jq.
export async function runWithoutTools(
  script: string,
): Promise<{ exitCode: number; stdout: string }> {
  const emptyPath = await mkdtemp(path.join(tmpdir(), "poll-no-tools-"));
  try {
    const { stdout } = await execFileAsync("/bin/bash", [script, "1"], {
      env: { PATH: emptyPath, REPO: "0xA3B/skills" },
    });
    return { exitCode: 0, stdout };
  } catch (caught: unknown) {
    const failure = caught as { code: number; stdout: string; stderr: string };
    return { exitCode: failure.code, stdout: failure.stdout + failure.stderr };
  } finally {
    await rm(emptyPath, { force: true, recursive: true });
  }
}
