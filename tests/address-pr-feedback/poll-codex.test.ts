import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const here = import.meta.dirname;
const script = path.resolve(
  here,
  "../../plugins/git/skills/address-pr-feedback/scripts/poll-codex.sh",
);

type Snapshot = Record<string, unknown>;
type Scenario = { snapshots: Snapshot[] };
type Thread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number;
  comments: {
    totalCount: number;
    nodes: { databaseId: number; author: { login: string }; createdAt: string; body: string }[];
  };
};

// Recorded from #293 with `record-poll`: a completed Codex review of 66b91ba with its 👍.
async function recordedClean(): Promise<Scenario> {
  return JSON.parse(await readFile(path.join(here, "fixtures/codex-clean.json"), "utf8"));
}

function thread(id: string, login: string, body: string): Thread {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    path: "src/example.ts",
    line: 1,
    comments: {
      totalCount: 1,
      nodes: [{ databaseId: 1, author: { login }, createdAt: "2026-11-07T03:17:20Z", body }],
    },
  };
}

function withThreads(threads: Thread[]): Snapshot {
  return {
    reviewThreads: {
      data: { repository: { pullRequest: { reviewThreads: { nodes: threads } } } },
    },
  };
}

function summaryBody(scenario: Scenario): string {
  const comments = scenario.snapshots[0]?.["issueComments"] as { body: string }[];
  return comments[0]?.body ?? "";
}

function withSummary(body: string): Snapshot {
  return { issueComments: [{ body, user: { login: "chatgpt-codex-connector[bot]" } }] };
}

function reactions(...items: [content: string, createdAt: string][]): Snapshot {
  return {
    reactions: items.map(([content, created_at]) => ({
      content,
      created_at,
      user: { login: "chatgpt-codex-connector[bot]" },
    })),
  };
}

// Runs poll-codex.sh against the fake gh. The stub sleep advances the scenario one snapshot.
async function poll(scenario: Scenario): Promise<{ exitCode: number; stdout: string }> {
  const work = await mkdtemp(path.join(tmpdir(), "poll-codex-"));
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
    const { FAKE_GH_REAL: _real, ...env } = process.env;
    try {
      const { stdout } = await execFileAsync(script, ["293", "60", "3"], {
        env: {
          ...env,
          FAKE_GH_DIR: work,
          PATH: `${bin}${path.delimiter}${env["PATH"] ?? ""}`,
          REPO: "0xA3B/skills",
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

describe("poll-codex.sh", () => {
  it("reads a completed review from the summary table row, not the details header", async () => {
    const { exitCode, stdout } = await poll(await recordedClean());

    expect(exitCode).toBe(0);
    expect(stdout).toContain("terminal: completed review of 66b91ba");
    expect(stdout).toContain("thumbs=1");
  });

  it("exits 1 and dumps the thread when Codex left a finding", async () => {
    const scenario = await recordedClean();
    Object.assign(
      scenario.snapshots[0] ?? {},
      reactions(),
      withThreads([thread("PRRT_codex", "chatgpt-codex-connector", "A Codex finding.")]),
    );

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("--- thread PRRT_codex");
    expect(stdout).toContain("A Codex finding.");
  });

  it("waits through a running review for the late 👍 of a clean one", async () => {
    const scenario = await recordedClean();
    const completed = summaryBody(scenario);
    const running = completed.replace(
      /✅ \*\*Completed\*\* <relative-time datetime="[^"]+">[^<]+<\/relative-time>/u,
      '🔄 **Running** since <relative-time datetime="2026-11-07T03:16:45Z">2026-11-07T03:16:45Z</relative-time>',
    );
    expect(running).not.toBe(completed);
    scenario.snapshots = [
      {
        ...scenario.snapshots[0],
        ...withSummary(running),
        ...reactions(["eyes", "2026-11-07T03:16:46Z"]),
      },
      { ...withSummary(completed), ...reactions() },
      reactions(["+1", "2026-11-07T03:17:30Z"]),
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("thumbs=1 after extra poll 1");
  });

  it("exits 3 when the head changes during the wait", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [
      {
        ...scenario.snapshots[0],
        ...withSummary("<!-- codex-pull-request-review-summary -->\n"),
        ...reactions(),
      },
      { pr: { ...pr, headRefOid: "0".repeat(40) } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(3);
    expect(stdout).toContain("head changed");
  });
});
