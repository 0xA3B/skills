import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { pollScript, replay, runWithoutTools, type Scenario, type Snapshot } from "./replay.js";

const script = pollScript("apply-dispositions.sh");

type Thread = { id: string; commentId: number; lastBody: string; isResolved?: boolean };
type Entry = { thread: string; verdict: string; reply: string };

// One review thread in the shape the script's query asks for.
function node({ id, commentId, lastBody, isResolved = false }: Thread): Snapshot {
  return {
    id,
    isResolved,
    firstComment: { nodes: [{ databaseId: commentId }] },
    lastComment: { nodes: [{ body: lastBody }] },
  };
}

// The review-thread connection served as one GraphQL page per argument.
function threadPages(...pages: Thread[][]): Scenario {
  return {
    snapshots: [
      {
        reviewThreads: pages.map((threads, index) => ({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  pageInfo: {
                    hasNextPage: index < pages.length - 1,
                    endCursor: `cursor-${index + 1}`,
                  },
                  nodes: threads.map(node),
                },
              },
            },
          },
        })),
      },
    ],
  };
}

function withFaults(scenario: Scenario, faults: Record<string, string>): Scenario {
  const [first, ...rest] = scenario.snapshots;
  return { snapshots: [{ ...first, faults }, ...rest] };
}

const A: Thread = { id: "PRRT_a", commentId: 11, lastBody: "Finding A." };
const B: Thread = { id: "PRRT_b", commentId: 22, lastBody: "Finding B." };
const REPLY_A = "Fixed in abc1234: the guard now checks `null`.\n\nValidated with `pnpm test`.";
const REPLY_B = "Not changed: the caller already rejects empty input.";

const work: string[] = [];
afterEach(async () => {
  await Promise.all(work.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function dispositionsFile(content: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "dispositions-"));
  work.push(dir);
  const file = path.join(dir, "dispositions.json");
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

async function apply(scenario: Scenario, entries: Entry[] | string) {
  return replay(script, scenario, ["294", await dispositionsFile(entries)]);
}

const reply = (threadId: string, body: string) => ({
  call: "addPullRequestReviewThreadReply",
  fields: { threadId, body },
});
const react = (commentId: number, content: string) => ({
  call: `POST repos/0xA3B/skills/pulls/comments/${commentId}/reactions`,
  fields: { content },
});
const resolve = (threadId: string) => ({ call: "resolveReviewThread", fields: { threadId } });

describe("apply-dispositions.sh", () => {
  it("replies, reacts, and resolves each entry in file order, then verifies", async () => {
    const { exitCode, stdout, writes } = await apply(threadPages([A, B]), [
      { thread: A.id, verdict: "accepted", reply: REPLY_A },
      { thread: B.id, verdict: "rejected", reply: REPLY_B },
    ]);

    expect(writes).toStrictEqual([
      reply(A.id, REPLY_A),
      react(A.commentId, "+1"),
      resolve(A.id),
      reply(B.id, REPLY_B),
      react(B.commentId, "-1"),
      resolve(B.id),
    ]);
    expect(stdout).toContain(`${A.id} accepted replied resolved verified`);
    expect(stdout).toContain(`${B.id} rejected replied resolved verified`);
    expect(stdout.trimEnd().split("\n").at(-1)).toBe("exit=0");
    expect(exitCode).toBe(0);
  });

  it("posts no reaction for verdict none", async () => {
    const { exitCode, stdout, writes } = await apply(threadPages([A]), [
      { thread: A.id, verdict: "none", reply: REPLY_A },
    ]);

    expect(writes).toStrictEqual([reply(A.id, REPLY_A), resolve(A.id)]);
    expect(stdout).toContain(`${A.id} none replied resolved verified`);
    expect(exitCode).toBe(0);
  });

  it("posts no second reply when the reply is already the thread's last comment", async () => {
    const { exitCode, stdout, writes } = await apply(threadPages([{ ...A, lastBody: REPLY_A }]), [
      { thread: A.id, verdict: "accepted", reply: REPLY_A },
    ]);

    expect(writes).toStrictEqual([react(A.commentId, "+1"), resolve(A.id)]);
    expect(stdout).toContain(`${A.id} accepted reply-present resolved verified`);
    expect(exitCode).toBe(0);
  });

  // The forge stores a comment body without its surrounding whitespace and with LF line endings.
  it("matches a stored reply that differs only in surrounding whitespace and line endings", async () => {
    const { exitCode, stdout, writes } = await apply(
      threadPages([{ ...A, lastBody: "Fixed.\n\nSecond paragraph." }]),
      [{ thread: A.id, verdict: "accepted", reply: "Fixed.\r\n\r\nSecond paragraph.\n" }],
    );

    expect(writes).toStrictEqual([react(A.commentId, "+1"), resolve(A.id)]);
    expect(stdout).toContain(`${A.id} accepted reply-present resolved verified`);
    expect(exitCode).toBe(0);
  });

  it("does not resolve an already-resolved thread again", async () => {
    const { exitCode, stdout, writes } = await apply(threadPages([{ ...A, isResolved: true }]), [
      { thread: A.id, verdict: "rejected", reply: REPLY_A },
    ]);

    expect(writes).toStrictEqual([reply(A.id, REPLY_A), react(A.commentId, "-1")]);
    expect(stdout).toContain(`${A.id} rejected replied already-resolved verified`);
    expect(exitCode).toBe(0);
  });

  it.each<[string, Entry[] | string, string]>([
    [
      "an unknown thread id",
      [
        { thread: A.id, verdict: "accepted", reply: REPLY_A },
        { thread: "PRRT_elsewhere", verdict: "accepted", reply: REPLY_B },
      ],
      "entry 2: thread PRRT_elsewhere is not a review thread of pull request #294 in 0xA3B/skills",
    ],
    [
      "a duplicate thread",
      [
        { thread: A.id, verdict: "accepted", reply: REPLY_A },
        { thread: A.id, verdict: "rejected", reply: REPLY_B },
      ],
      `entry 2: thread ${A.id} already appears in entry 1`,
    ],
    [
      "an empty reply",
      [
        { thread: A.id, verdict: "accepted", reply: REPLY_A },
        { thread: B.id, verdict: "rejected", reply: "" },
      ],
      `entry 2 (${B.id}): reply must be non-empty markdown text`,
    ],
    [
      "an unknown verdict",
      [{ thread: A.id, verdict: "fixed", reply: REPLY_A }],
      `entry 1 (${A.id}): verdict must be "accepted", "rejected", or "none", not "fixed"`,
    ],
    [
      "a file that is not an array",
      JSON.stringify({ thread: A.id, verdict: "accepted", reply: REPLY_A }),
      "dispositions file is not a JSON array of entries",
    ],
    ["a file that is not JSON", "not json", "dispositions file is not valid JSON"],
  ])("exits 6 and writes nothing for %s", async (_case, entries, message) => {
    const { exitCode, stdout, writes } = await apply(threadPages([A, B]), entries);

    expect(stdout).toContain(message);
    expect(writes).toStrictEqual([]);
    expect(exitCode).toBe(6);
  });

  it("exits 1 with MISMATCH when a thread stays unresolved after the resolve call", async () => {
    const { exitCode, stdout, writes } = await apply(
      withFaults(threadPages([A, B]), { resolveReviewThread: "ignore" }),
      [
        { thread: A.id, verdict: "accepted", reply: REPLY_A },
        { thread: B.id, verdict: "rejected", reply: REPLY_B },
      ],
    );

    expect(writes).toHaveLength(6);
    expect(stdout).toContain(`${A.id} accepted replied resolved MISMATCH`);
    expect(stdout).toContain(`${B.id} rejected replied resolved MISMATCH`);
    expect(exitCode).toBe(1);
  });

  it("exits 6 naming the entry and step when a gh write fails", async () => {
    const { exitCode, stdout, writes } = await apply(
      withFaults(threadPages([A, B]), { [react(B.commentId, "-1").call]: "fail" }),
      [
        { thread: A.id, verdict: "none", reply: REPLY_A },
        { thread: B.id, verdict: "rejected", reply: REPLY_B },
      ],
    );

    expect(writes).toStrictEqual([
      reply(A.id, REPLY_A),
      resolve(A.id),
      reply(B.id, REPLY_B),
      react(B.commentId, "-1"),
    ]);
    expect(stdout).toContain(`write failure: entry 2 (${B.id}) react`);
    expect(stdout).not.toContain("verified");
    expect(exitCode).toBe(6);
  });

  it("exits 6 and names the tool when gh is missing", async () => {
    const { exitCode, stdout } = await runWithoutTools(script);

    expect(exitCode).toBe(6);
    expect(stdout).toContain("missing dependency: gh");
  });

  it("finds and verifies a thread beyond the first page of review threads", async () => {
    const { exitCode, stdout, writes } = await apply(threadPages([A], [B]), [
      { thread: B.id, verdict: "accepted", reply: REPLY_B },
    ]);

    expect(writes).toStrictEqual([reply(B.id, REPLY_B), react(B.commentId, "+1"), resolve(B.id)]);
    expect(stdout).toContain(`${B.id} accepted replied resolved verified`);
    expect(exitCode).toBe(0);
  });
});
