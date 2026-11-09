import { describe, expect, it } from "vitest";

import { pollScript, recorded, replay, type Scenario, type Snapshot } from "./replay.js";

const script = pollScript("poll-copilot.sh");

type Review = {
  id: number;
  user: { login: string };
  state: string;
  commit_id: string;
  submitted_at: string;
  body: string;
};

// Recorded from #294 with `record-poll`: Copilot was requested on the opening head be6fd0c and
// reviewed it without findings.
async function recordedClean(): Promise<Scenario> {
  return recorded("copilot-clean.json");
}

function first(scenario: Scenario): Snapshot {
  const snapshot = scenario.snapshots[0];
  if (snapshot === undefined) {
    throw new Error("the fixture has no snapshots");
  }
  return snapshot;
}

function headOf(scenario: Scenario): string {
  return (first(scenario)["pr"] as { headRefOid: string }).headRefOid;
}

function review(scenario: Scenario, overrides: Partial<Review> = {}): Review {
  const [recordedReview] = first(scenario)["reviews"] as Review[];
  if (recordedReview === undefined) {
    throw new Error("the fixture has no review");
  }
  return { ...recordedReview, ...overrides };
}

function thread(id: string, login: string, body: string): Snapshot {
  return {
    id,
    isResolved: false,
    comments: {
      totalCount: 1,
      nodes: [{ author: { login }, path: "src/example.ts", line: 1, body }],
    },
  };
}

function withThreads(threads: Snapshot[]): Snapshot {
  return {
    reviewThreads: {
      data: { repository: { pullRequest: { reviewThreads: { nodes: threads } } } },
    },
  };
}

function copilotRule(parameters: Record<string, boolean>): Snapshot {
  return { rules: [{ type: "copilot_code_review", parameters }] };
}

// The recorded state before Copilot acknowledged the head: no request, no review.
function unacknowledged(scenario: Scenario, extra: Snapshot = {}): Scenario {
  return { snapshots: [{ ...first(scenario), timeline: [], reviews: [], ...extra }] };
}

async function poll(scenario: Scenario): Promise<{ exitCode: number; stdout: string }> {
  return replay(script, scenario, ["294", "60", "3"]);
}

describe("poll-copilot.sh", () => {
  it("exits 0 on a completed review of the head with no Copilot threads", async () => {
    const { exitCode, stdout } = await poll(await recordedClean());

    expect(exitCode).toBe(0);
    expect(stdout).toContain("acknowledged; waiting for a review of be6fd0c");
    expect(stdout).toContain("no unresolved Copilot threads");
  });

  it("exits 1 and dumps only the Copilot threads when the review left findings", async () => {
    const scenario = await recordedClean();
    Object.assign(
      first(scenario),
      withThreads([
        thread("PRRT_copilot", "copilot-pull-request-reviewer", "A Copilot finding."),
        thread("PRRT_codex", "chatgpt-codex-connector", "A Codex finding."),
      ]),
    );

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(1);
    expect(stdout).toContain("--- unresolved Copilot threads");
    expect(stdout).toContain("A Copilot finding.");
    expect(stdout).not.toContain("A Codex finding.");
  });

  // Openings of review bodies Copilot posted on public pull requests in place of a review.
  it.each([
    "Copilot was unable to review this pull request because the user who requested the review has insufficient remaining quota.",
    "Copilot was unable to review this pull request because there is no eligible user to bill.",
    "Copilot was unable to review this pull request due to rate limiting. Please try again later.",
    "Copilot encountered an error and was unable to review this pull request. You can try again by re-requesting a review.",
    "Copilot encountered an error: Your billing is not configured or you have Copilot licenses from multiple standalone organizations or enterprises.",
    "Copilot wasn't able to review this pull request because it exceeds the maximum number of files (300).",
    "Copilot wasn't able to review any files in this pull request. Copilot's per-file or total diff limits were exceeded.",
    "Copilot couldn’t review any files in this pull request.",
    // Wordings the pattern accepted before the public sample; no body in the sample used them.
    "Copilot could not review this pull request.",
    "Copilot couldn't review this pull request.",
  ])("exits 2 when the review body says Copilot could not review: %s", async (body) => {
    const scenario = await recordedClean();
    first(scenario)["reviews"] = [review(scenario, { body })];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(2);
    expect(stdout).toContain("Copilot could not review this head");
  });

  // A note above a completed review's overview limits that review; the review still counts.
  it.each([
    "> [!NOTE]\n> Copilot was unable to complete this review at the selected tier due to model policy or plan restrictions.\n\n<!-- ccr-overview-v2 -->\n\n### 🟢 Approval recommended",
    "> [!NOTE]\n> Copilot was unable to run its full agentic suite in this review.\n\n<!-- ccr-overview-v2 -->\n\n### 🟢 Approval recommended",
  ])("treats a completed review with a limiting note as completed: %s", async (body) => {
    const scenario = await recordedClean();
    first(scenario)["reviews"] = [review(scenario, { body })];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("no unresolved Copilot threads");
  });

  it("matches only an apostrophe between couldn and t", async () => {
    const scenario = await recordedClean();
    first(scenario)["reviews"] = [
      review(scenario, { body: "Copilot couldnXt review this pull request." }),
    ];

    const { exitCode } = await poll(scenario);

    expect(exitCode).toBe(0);
  });

  it("waits after a review request for the review of the head", async () => {
    const scenario = await recordedClean();
    const completed = first(scenario)["reviews"];
    scenario.snapshots = [{ ...first(scenario), reviews: [] }, {}, { reviews: completed }];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("acknowledged; waiting for a review of be6fd0c");
    expect(stdout).toContain("no unresolved Copilot threads");
  });

  it("exits 3 when the head changes during the wait", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;
    scenario.snapshots = [
      { ...first(scenario), reviews: [] },
      { pr: { ...pr, headRefOid: "0".repeat(40) } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(3);
    expect(stdout).toContain(`head changed: ${"0".repeat(40)}`);
  });

  it("exits 4 when the rules review the head but no acknowledgment comes", async () => {
    const scenario = await recordedClean();

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, copilotRule({ review_on_push: true })),
    );

    expect(exitCode).toBe(4);
    expect(stdout).toContain("configuration reviews this head; waiting 2 interval(s)");
    expect(stdout).toContain(`no acknowledgment of ${headOf(scenario)} within 2 interval(s)`);
  });

  it("does not count a review request made before the head was published", async () => {
    const scenario = await recordedClean();

    const { exitCode } = await poll(
      unacknowledged(scenario, {
        ...copilotRule({ review_on_push: true }),
        timeline: [
          {
            event: "review_requested",
            created_at: "2026-11-07T03:00:00Z",
            requested_reviewer: { login: "Copilot" },
          },
        ],
      }),
    );

    expect(exitCode).toBe(4);
  });

  it("exits 5 when an acknowledged review never arrives", async () => {
    const scenario = await recordedClean();
    first(scenario)["reviews"] = [];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(5);
    expect(stdout).toContain("max polls reached");
  });

  it("exits 7 when no rule applies and Copilot never reviewed the pull request", async () => {
    const scenario = await recordedClean();

    const { exitCode, stdout } = await poll(unacknowledged(scenario, { rules: [] }));

    expect(exitCode).toBe(7);
    expect(stdout).toContain("not configured: no copilot_code_review rule applies to main");
  });

  it("reads the rules of a base branch whose name contains a slash", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, { rules: [], pr: { ...pr, baseRefName: "release/2026" } }),
    );

    expect(exitCode).toBe(7);
    expect(stdout).toContain("no copilot_code_review rule applies to release/2026");
  });

  it("exits 8 with the last reviewed head when the rules do not review pushes", async () => {
    const scenario = await recordedClean();
    const earlier = "1".repeat(40);

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, {
        ...copilotRule({ review_on_push: false }),
        reviews: [review(scenario, { commit_id: earlier })],
      }),
    );

    expect(exitCode).toBe(8);
    expect(stdout).toContain("no copilot_code_review rule for main sets review_on_push");
    expect(stdout).toContain(`last reviewed head=${earlier}`);
  });

  it("expects no review of a head pushed before the pull request was retargeted", async () => {
    const scenario = await recordedClean();

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, {
        ...copilotRule({ review_on_push: true }),
        timeline: [{ event: "base_ref_changed", created_at: "2026-11-07T04:00:00Z" }],
      }),
    );

    expect(exitCode).toBe(7);
    expect(stdout).toContain("retargeted=2026-11-07T04:00:00Z");
    expect(stdout).toContain("the pull request was retargeted to main at 2026-11-07T04:00:00Z");
  });

  it("expects no review of a draft when no rule reviews drafts", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, {
        ...copilotRule({ review_on_push: true, review_draft_pull_requests: false }),
        pr: { ...pr, isDraft: true },
      }),
    );

    expect(exitCode).toBe(7);
    expect(stdout).toContain("no copilot_code_review rule for main reviews draft pull requests");
  });

  it("expects a review of the head the pull request first left draft with", async () => {
    const scenario = await recordedClean();

    const { exitCode, stdout } = await poll(
      unacknowledged(scenario, {
        ...copilotRule({ review_on_push: false }),
        timeline: [{ event: "ready_for_review", created_at: "2026-11-07T04:00:00Z" }],
      }),
    );

    expect(exitCode).toBe(4);
    expect(stdout).toContain("the pull request first left draft at 2026-11-07T04:00:00Z");
  });
});
