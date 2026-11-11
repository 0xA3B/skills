import { describe, expect, it } from "vitest";

import {
  pollScript,
  recorded,
  replay,
  runWithoutTools,
  type Scenario,
  type Snapshot,
} from "./replay.js";

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

async function poll(
  scenario: Scenario,
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string }> {
  return replay(script, scenario, ["294", "60", "3"], env);
}

const EARLIER_HEAD = "1".repeat(40);

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

  it("waits for the forge to report the expected head before classifying", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;
    const head = headOf(scenario);
    scenario.snapshots = [{ ...first(scenario), pr: { ...pr, headRefOid: EARLIER_HEAD } }, { pr }];

    const { exitCode, stdout } = await poll(scenario, { EXPECT_HEAD: head });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`waiting for the forge to report ${head}`);
    expect(stdout).toContain("no unresolved Copilot threads");
  });

  it("exits 6 when the forge reports no head while the script waits for the expected one", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;
    scenario.snapshots = [{ ...first(scenario), pr: { ...pr, headRefOid: null } }];

    const { exitCode, stdout } = await poll(scenario, { EXPECT_HEAD: EARLIER_HEAD });

    expect(exitCode).toBe(6);
    expect(stdout).toContain("observation failure: pr head");
  });

  it("exits 3 when the forge never reports the expected head", async () => {
    const scenario = await recordedClean();

    const { exitCode, stdout } = await poll(scenario, { EXPECT_HEAD: EARLIER_HEAD });

    expect(exitCode).toBe(3);
    expect(stdout).toContain(
      `the forge reports ${headOf(scenario)}, not the expected ${EARLIER_HEAD}`,
    );
    expect(stdout).not.toContain("acknowledged");
  });

  it("exits 3 when the base changes during the wait", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;
    scenario.snapshots = [
      { ...first(scenario), reviews: [] },
      { reviews: [review(scenario)], pr: { ...pr, baseRefName: "develop" } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(3);
    expect(stdout).toContain("base changed: develop");
  });

  // A base the forge fails to report is a failed observation, not a retarget.
  it("exits 6 when the forge reports no base during the wait", async () => {
    const scenario = await recordedClean();
    const pr = first(scenario)["pr"] as Snapshot;
    scenario.snapshots = [
      { ...first(scenario), reviews: [] },
      { reviews: [review(scenario)], pr: { ...pr, baseRefName: null } },
    ];

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(6);
    expect(stdout).toContain("observation failure: empty base");
  });

  // Timeline timestamps have one-second precision, so the request at 03:39:05Z cannot be placed
  // after a retarget in the same second.
  it("exits 9 when the head's review was requested in the same second as the retarget", async () => {
    const scenario = await recordedClean();
    const requests = first(scenario)["timeline"] as Snapshot[];
    Object.assign(first(scenario), {
      ...copilotRule({ review_on_push: true }),
      timeline: [...requests, { event: "base_ref_changed", created_at: "2026-11-07T03:39:05Z" }],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(9);
    expect(stdout).not.toContain("no unresolved Copilot threads");
  });

  // A review of the diff against the old base says nothing about the diff against the new one.
  it.each(["base_ref_changed", "automatic_base_change_succeeded"])(
    "exits 9 when the head's review and its request predate a %s event",
    async (event) => {
      const scenario = await recordedClean();
      const requests = first(scenario)["timeline"] as Snapshot[];
      Object.assign(first(scenario), {
        ...copilotRule({ review_on_push: true }),
        timeline: [...requests, { event, created_at: "2026-11-07T04:00:00Z" }],
      });

      const { exitCode, stdout } = await poll(scenario);

      expect(exitCode).toBe(9);
      expect(stdout).toContain("was requested before the retarget at 2026-11-07T04:00:00Z");
    },
  );

  // The review was requested at 03:39:05Z and submitted at 03:41:55Z, so it started on the old base.
  it("exits 9 when the pull request is retargeted while the head's review runs", async () => {
    const scenario = await recordedClean();
    const requests = first(scenario)["timeline"] as Snapshot[];
    Object.assign(first(scenario), {
      ...copilotRule({ review_on_push: true }),
      timeline: [...requests, { event: "base_ref_changed", created_at: "2026-11-07T03:40:00Z" }],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(9);
    expect(stdout).not.toContain("no unresolved Copilot threads");
  });

  // A request made after the retarget asks for a new review; the review that was already running
  // still covered the old base.
  it("does not count a review that started before a retarget when a later request follows it", async () => {
    const scenario = await recordedClean();
    const requests = first(scenario)["timeline"] as Snapshot[];
    Object.assign(first(scenario), {
      timeline: [
        ...requests,
        { event: "base_ref_changed", created_at: "2026-11-07T03:40:00Z" },
        {
          event: "review_requested",
          created_at: "2026-11-07T03:45:00Z",
          requested_reviewer: { login: "Copilot" },
        },
      ],
    });

    const { exitCode, stdout } = await poll(scenario);

    expect(exitCode).toBe(5);
    expect(stdout).toContain("acknowledged; waiting for a review");
    expect(stdout).not.toContain("no unresolved Copilot threads");
  });

  it("exits 6 and names the tool when gh is missing", async () => {
    const { exitCode, stdout } = await runWithoutTools(script);

    expect(exitCode).toBe(6);
    expect(stdout).toContain("missing dependency: gh");
  });
});
