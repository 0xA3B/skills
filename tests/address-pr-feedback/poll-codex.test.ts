import { describe, expect, it } from "vitest";

import { pollScript, recorded, replay, type Scenario, type Snapshot } from "./replay.js";

const script = pollScript("poll-codex.sh");

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
  return recorded("codex-clean.json");
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

async function poll(scenario: Scenario): Promise<{ exitCode: number; stdout: string }> {
  return replay(script, scenario, ["293", "60", "3"]);
}

describe("poll-codex.sh", () => {
  it("reads a completed review from the summary table row, not the details header", async () => {
    const { exitCode, stdout } = await poll(await recordedClean());

    expect(exitCode).toBe(0);
    expect(stdout).toContain("terminal: completed review of 66b91ba");
    expect(stdout).toContain("thumbs=1");
  });

  it("exits 0 on a clean Codex review when another reviewer left an unresolved thread", async () => {
    const scenario = await recordedClean();
    Object.assign(
      scenario.snapshots[0] ?? {},
      withThreads([thread("PRRT_copilot", "copilot-pull-request-reviewer", "A Copilot finding.")]),
    );

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("A Copilot finding.");
    expect(stdout).toContain("=== pr state (unresolved threads: 1)");
  });

  it("exits 1 and dumps the thread when Codex left a finding", async () => {
    const scenario = await recordedClean();
    Object.assign(
      scenario.snapshots[0] ?? {},
      reactions(),
      withThreads([
        thread("PRRT_codex", "chatgpt-codex-connector", "A Codex finding."),
        thread("PRRT_copilot", "copilot-pull-request-reviewer", "A Copilot finding."),
      ]),
    );

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("--- thread PRRT_codex");
    expect(stdout).toContain("A Codex finding.");
    expect(stdout).not.toContain("A Copilot finding.");
    expect(stdout).toContain("=== pr state (unresolved threads: 2)");
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
