import { describe, expect, it } from "vitest";

import {
  pollScript,
  recorded,
  replay,
  runWithoutTools,
  type Scenario,
  type Snapshot,
} from "./replay.js";

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

// Recorded from #293 with `record-poll`: a completed Codex review of 66b91ba with its 👍. The base
// branch and the empty retarget timeline were added by hand when the script began to read them;
// #293 targeted main and was never retargeted.
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

async function poll(
  scenario: Scenario,
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string }> {
  return replay(script, scenario, ["293", "60", "3"], env);
}

const RECORDED_HEAD = "66b91ba1368a60a7d13d1bb715a2af47ffe2173e";
const EARLIER_HEAD = "1".repeat(40);

function runningSummary(scenario: Scenario): string {
  const completed = summaryBody(scenario);
  const running = completed.replace(
    /✅ \*\*Completed\*\* <relative-time datetime="[^"]+">[^<]+<\/relative-time>/u,
    '🔄 **Running** since <relative-time datetime="2026-11-07T03:16:45Z">2026-11-07T03:16:45Z</relative-time>',
  );
  expect(running).not.toBe(completed);
  return running;
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

  // A finding can exist only in a review body, which no thread carries.
  it("dumps the body of each Codex review of the head", async () => {
    const scenario = await recordedClean();
    const review = (commit: string, login: string, body: string): Snapshot => ({
      id: 1,
      user: { login },
      state: "COMMENTED",
      commit_id: commit,
      submitted_at: "2026-11-07T03:20:00Z",
      body,
    });
    Object.assign(scenario.snapshots[0] ?? {}, {
      reviews: [
        review(RECORDED_HEAD, "chatgpt-codex-connector[bot]", "A body-only Codex finding."),
        review(EARLIER_HEAD, "chatgpt-codex-connector[bot]", "A review of an earlier head."),
        review(RECORDED_HEAD, "copilot-pull-request-reviewer[bot]", "A Copilot review body."),
      ],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`=== Codex review bodies (head ${RECORDED_HEAD})`);
    expect(stdout).toContain("A body-only Codex finding.");
    expect(stdout).not.toContain("A review of an earlier head.");
    expect(stdout).not.toContain("A Copilot review body.");
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

  // Observed on #252: GitHub reported the earlier head for about 11 minutes after a force push,
  // and the script classified that head's completed review under exit 0.
  it("waits for the forge to report the expected head before classifying", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [
      { ...scenario.snapshots[0], pr: { ...pr, headRefOid: EARLIER_HEAD } },
      { pr },
    ];

    const { exitCode, stdout } = await poll(scenario, { EXPECT_HEAD: RECORDED_HEAD });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`waiting for the forge to report ${RECORDED_HEAD}`);
    expect(stdout).toContain("terminal: completed review of 66b91ba");
  });

  it("exits 3 when the forge never reports the expected head", async () => {
    const { exitCode, stdout } = await poll(await recordedClean(), { EXPECT_HEAD: EARLIER_HEAD });

    expect(exitCode).toBe(3);
    expect(stdout).toContain(
      `the forge reports ${RECORDED_HEAD}, not the expected ${EARLIER_HEAD}`,
    );
    expect(stdout).not.toContain("terminal:");
  });

  it("exits 3 when the base changes during the wait", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [
      {
        ...scenario.snapshots[0],
        ...withSummary(runningSummary(scenario)),
        ...reactions(["eyes", "2026-11-07T03:16:46Z"]),
      },
      { ...withSummary(summaryBody(scenario)), pr: { ...pr, baseRefName: "develop" } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(3);
    expect(stdout).toContain("base changed: develop");
  });

  it("exits 6 when the forge reports no head while the script waits for the expected one", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [{ ...scenario.snapshots[0], pr: { ...pr, headRefOid: null } }];

    const { exitCode, stdout } = await poll(scenario, { EXPECT_HEAD: EARLIER_HEAD });

    expect(exitCode).toBe(6);
    expect(stdout).toContain("observation failure: empty head");
  });

  // A base the forge fails to report is a failed observation, not a retarget.
  it("exits 6 when the forge reports no base during the wait", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [
      { ...scenario.snapshots[0], ...reactions() },
      { pr: { ...pr, baseRefName: null } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(6);
    expect(stdout).toContain("observation failure: empty base");
  });

  // The terminal exit re-reads the state after the dump and the extra 👍 polls.
  it("exits 3 when the base changes after the terminal signal", async () => {
    const scenario = await recordedClean();
    const pr = scenario.snapshots[0]?.["pr"] as Record<string, unknown>;
    scenario.snapshots = [
      { ...scenario.snapshots[0], ...reactions() },
      { pr: { ...pr, baseRefName: "develop" } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(stdout).toContain("terminal: completed review of 66b91ba");
    expect(exitCode).toBe(3);
    expect(stdout).toContain("base changed: develop");
  });

  // A review of the diff against the old base says nothing about the diff against the new one.
  // GitHub records a manual retarget as base_ref_changed and its own retarget of a stacked pull
  // request as automatic_base_change_succeeded.
  it.each(["base_ref_changed", "automatic_base_change_succeeded"])(
    "exits 9 when the head's completed review predates a %s event",
    async (event) => {
      const scenario = await recordedClean();
      Object.assign(scenario.snapshots[0] ?? {}, {
        timeline: [{ event, created_at: "2026-11-08T00:00:00Z" }],
      });

      const { exitCode, stdout } = await poll(scenario);

      expect(exitCode).toBe(9);
      expect(stdout).toContain("predates the retarget at 2026-11-08T00:00:00Z");
    },
  );

  // The recorded review completed at 03:17:27Z and its 👍 came at 03:17:30Z.
  it("does not read a stale review's late 👍 as a reaction-only clean signal", async () => {
    const scenario = await recordedClean();
    Object.assign(scenario.snapshots[0] ?? {}, {
      timeline: [{ event: "base_ref_changed", created_at: "2026-11-07T03:17:28Z" }],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(9);
    expect(stdout).not.toContain("reaction-only clean signal");
  });

  it("counts a review that completed in the same second as the retarget", async () => {
    const scenario = await recordedClean();
    Object.assign(scenario.snapshots[0] ?? {}, {
      timeline: [{ event: "base_ref_changed", created_at: "2026-11-07T03:17:27Z" }],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("terminal: completed review of 66b91ba");
  });

  it("exits 6 and names the tool when gh is missing", async () => {
    const { exitCode, stdout } = await runWithoutTools(script);

    expect(exitCode).toBe(6);
    expect(stdout).toContain("missing dependency: gh");
  });
});
