#!/usr/bin/env node
// A stand-in for `gh` that replays the GitHub responses a babysit-pr script reads, one snapshot per
// elapsed `sleep`, or records them from the real `gh`. Both modes keep their state in FAKE_GH_DIR:
// `scenario.json` holds `{ "snapshots": [ { "<key>": <data>, ... }, ... ] }`, and `clock` counts
// the sleeps so far. Snapshot n holds only the keys that changed at clock n; a read at clock c sees
// every key's latest value at or before c. `--jq` and `-q` filters run through `jq -r -c`, which
// matches how `gh` prints a filter's strings raw.
//
// A GraphQL fixture may be an array of pages, each with its connection's `pageInfo`. Like `gh`, a
// `--paginate` call whose query declares `$endCursor` and reads `hasNextPage` gets every page up to
// the first without `"hasNextPage": true`, each filtered on its own; any other call gets the first.
//
// Writes, a GraphQL mutation or a POST to a review comment's reactions, are replayed only: each
// appends `{ "call", "fields" }` to `writes.jsonl` in FAKE_GH_DIR, where `call` is the mutation
// name or `POST <endpoint>`, and `fields` holds every `-f`/`-F` value except the query. A write
// changes the `reviewThreads` fixture at the current clock the way GitHub would:
// `addPullRequestReviewThreadReply` makes its body the thread's `lastComment`, and
// `resolveReviewThread` sets `isResolved`. The fixture key `faults` maps a `call` to `"fail"`, which
// exits 1 as `gh` does on an API error, or `"ignore"`, which answers but changes nothing.
//
// Replay: FAKE_GH_DIR=<dir> gh <args>
// Record: FAKE_GH_DIR=<dir> FAKE_GH_REAL=<path to the real gh> gh <args>
//
// A call the stub cannot map to a fixture key fails with a message naming the call, so a script
// change that reads a new endpoint shows up as a failing test instead of an empty response.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env["FAKE_GH_DIR"];
if (!dir) {
  fail("FAKE_GH_DIR is not set");
}
const args = process.argv.slice(2);
const real = process.env["FAKE_GH_REAL"];

// The timeline events the poll scripts read; recording drops the rest.
const TIMELINE_EVENTS = new Set([
  "automatic_base_change_succeeded",
  "base_ref_changed",
  "ready_for_review",
  "review_requested",
]);

const { key, filter, passArgs, query, fields, paginate, graphql, write } = parseCall(args);
const scenarioPath = path.join(dir, "scenario.json");
const scenario = readScenario();
const clock = readClock();

let data;
if (write !== undefined) {
  if (real) {
    fail(`refusing to record a write: gh ${args.join(" ")}`);
  }
  data = replayWrite(write);
} else if (real) {
  data = trim(key, record(passArgs));
  const current = effective(clock)[key];
  if (JSON.stringify(current) !== JSON.stringify(data)) {
    while (scenario.snapshots.length <= clock) {
      scenario.snapshots.push({});
    }
    scenario.snapshots[clock][key] = data;
    writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
  }
} else {
  data = effective(clock)[key];
  if (data === undefined) {
    fail(`no "${key}" fixture at clock ${clock} for: gh ${args.join(" ")}`);
  }
}

for (const page of pagesOf(data)) {
  if (filter === undefined) {
    process.stdout.write(`${JSON.stringify(page)}\n`);
    continue;
  }
  try {
    process.stdout.write(
      execFileSync("jq", ["-r", "-c", filter], { input: JSON.stringify(page), encoding: "utf8" }),
    );
  } catch (jqError) {
    process.stderr.write(String(jqError.stderr ?? jqError));
    process.exit(1);
  }
}

// The pages `gh` would print for a GraphQL fixture stored as an array of pages.
function pagesOf(value) {
  if (!graphql || !Array.isArray(value)) {
    return [value];
  }
  if (!paginate || !query.includes("$endCursor") || !query.includes("hasNextPage")) {
    return value.slice(0, 1);
  }
  const served = [];
  for (const page of value) {
    served.push(page);
    if (!JSON.stringify(page).includes('"hasNextPage":true')) {
      break;
    }
  }
  return served;
}

// Record a write, apply its effect unless a fault says otherwise, and return GitHub's answer.
function replayWrite({ call, mutation }) {
  appendFileSync(path.join(dir, "writes.jsonl"), `${JSON.stringify({ call, fields })}\n`);
  const fault = effective(clock)["faults"]?.[call];
  if (fault === "fail") {
    fail(`injected failure for ${call}`);
  }
  if (fault !== undefined && fault !== "ignore") {
    fail(`unknown fault "${fault}" for ${call}`);
  }
  if (fault === undefined && mutation !== undefined) {
    applyToThread(mutation);
  }
  switch (mutation) {
    case "addPullRequestReviewThreadReply":
      return { data: { [mutation]: { comment: { id: "PRRC_fake" } } } };
    case "resolveReviewThread":
      return { data: { [mutation]: { thread: { isResolved: fault === undefined } } } };
    case undefined:
      return { content: fields["content"] };
    default:
      return fail(`no replay for mutation ${mutation}`);
  }
}

// Change the thread a mutation names in the `reviewThreads` fixture, at the current clock.
function applyToThread(mutation) {
  const threads = structuredClone(effective(clock)["reviewThreads"]);
  const pages = Array.isArray(threads) ? threads : [threads];
  const thread = pages
    .flatMap((page) => page?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [])
    .find((candidate) => candidate.id === fields["threadId"]);
  if (thread === undefined) {
    fail(`${mutation}: no review thread ${fields["threadId"]} in the fixture`);
  }
  if (mutation === "addPullRequestReviewThreadReply") {
    thread.lastComment = { nodes: [{ body: fields["body"] }] };
  } else if (mutation === "resolveReviewThread") {
    thread.isResolved = true;
  }
  while (scenario.snapshots.length <= clock) {
    scenario.snapshots.push({});
  }
  scenario.snapshots[clock]["reviewThreads"] = threads;
  writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`fake gh: ${message}\n`);
  process.exit(1);
}

function readScenario() {
  try {
    return JSON.parse(readFileSync(scenarioPath, "utf8"));
  } catch {
    if (real) {
      return { snapshots: [] };
    }
    return fail(`cannot read ${scenarioPath}`);
  }
}

function readClock() {
  try {
    return Number.parseInt(readFileSync(path.join(dir, "clock"), "utf8"), 10) || 0;
  } catch {
    return 0;
  }
}

function effective(at) {
  const view = {};
  for (const snapshot of scenario.snapshots.slice(0, at + 1)) {
    Object.assign(view, snapshot);
  }
  return view;
}

// The fixture key or write for a call, its jq filter, its query and fields, and the arguments to
// pass to the real gh.
function parseCall(callArgs) {
  const passed = [];
  let jq;
  let callQuery = "";
  let method;
  const callFields = {};
  const positional = [];
  for (let i = 0; i < callArgs.length; i++) {
    const arg = callArgs[i];
    if (arg === "--jq" || arg === "-q") {
      jq = callArgs[++i];
      continue;
    }
    passed.push(arg);
    if (["-F", "-f", "--repo", "--json", "-X", "--method", "-H"].includes(arg)) {
      const value = callArgs[++i];
      passed.push(value);
      if (arg === "-X" || arg === "--method") {
        method = value.toUpperCase();
      } else if ((arg === "-f" || arg === "-F") && value?.includes("=")) {
        const name = value.slice(0, value.indexOf("="));
        if (name === "query") {
          callQuery = value;
        } else {
          callFields[name] = value.slice(name.length + 1);
        }
      }
      continue;
    }
    if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  const call = {
    filter: jq,
    passArgs: passed,
    query: callQuery,
    fields: callFields,
    paginate: passed.includes("--paginate"),
    graphql: false,
  };
  const [command, subcommand] = positional;
  if (command === "pr" && subcommand === "view") {
    return { ...call, key: "pr" };
  }
  if (command === "api" && subcommand === "graphql") {
    call.graphql = true;
    const mutation = /^query=\s*mutation\b[^{]*\{\s*(?<name>\w+)/u.exec(callQuery)?.groups?.name;
    if (mutation !== undefined) {
      return { ...call, write: { call: mutation, mutation } };
    }
    if (callQuery.includes("HEAD_REF_FORCE_PUSHED_EVENT")) {
      return { ...call, key: "forcePushes" };
    }
    if (callQuery.includes("reviewThreads")) {
      return { ...call, key: "reviewThreads" };
    }
  }
  // `gh api` sends POST when it has fields and no method.
  const sends = method ?? (Object.keys(callFields).length > 0 ? "POST" : "GET");
  if (
    command === "api" &&
    sends === "POST" &&
    /\/pulls\/comments\/\d+\/reactions$/u.test(subcommand)
  ) {
    return { ...call, write: { call: `POST ${subcommand}` } };
  }
  if (command === "api" && subcommand !== undefined) {
    const endpoint = subcommand.split("?")[0];
    const keys = [
      [/\/commits\/[0-9a-f]+$/u, "commit"],
      [/\/commits\/[0-9a-f]+\/check-suites$/u, "checkSuites"],
      [/\/issues\/\d+\/comments$/u, "issueComments"],
      [/\/issues\/\d+\/reactions$/u, "reactions"],
      [/\/issues\/\d+\/timeline$/u, "timeline"],
      [/\/pulls\/\d+\/reviews$/u, "reviews"],
      // A branch name can contain slashes, and the scripts pass it unencoded.
      [/\/rules\/branches\/.+$/u, "rules"],
    ];
    for (const [pattern, endpointKey] of keys) {
      if (pattern.test(endpoint)) {
        return { ...call, key: endpointKey };
      }
    }
  }
  return fail(`no fixture key for: gh ${callArgs.join(" ")}`);
}

// Run the real gh without the filter. A paginated call is slurped so its pages arrive as one JSON
// array; array pages are flattened, and a multi-page object result, such as GraphQL or check
// suites, is refused because replay serves one page.
function record(realArgs) {
  const paginated = realArgs.includes("--paginate");
  const output = execFileSync(real, paginated ? [...realArgs, "--slurp"] : realArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(output);
  if (!paginated) {
    return parsed;
  }
  if (parsed.every((page) => Array.isArray(page))) {
    return parsed.flat();
  }
  if (parsed.length !== 1) {
    return fail(`cannot record a ${parsed.length}-page object result: gh ${realArgs.join(" ")}`);
  }
  return parsed[0];
}

// Keep only the fields the poll scripts read, so a fixture diff stays reviewable.
function trim(fixtureKey, value) {
  switch (fixtureKey) {
    case "reactions":
      return value.map((reaction) => ({
        content: reaction.content,
        created_at: reaction.created_at,
        user: { login: reaction.user?.login },
      }));
    case "issueComments":
      return value.map((comment) => ({ body: comment.body, user: { login: comment.user?.login } }));
    case "timeline":
      return value
        .filter((item) => TIMELINE_EVENTS.has(item.event))
        .map((item) => ({
          event: item.event,
          created_at: item.created_at,
          ...(item.requested_reviewer
            ? { requested_reviewer: { login: item.requested_reviewer.login } }
            : {}),
        }));
    case "reviews":
      return value.map((review) => ({
        id: review.id,
        user: { login: review.user?.login },
        state: review.state,
        commit_id: review.commit_id,
        submitted_at: review.submitted_at,
        body: review.body,
      }));
    case "checkSuites":
      return {
        check_suites: value.check_suites.map((suite) => ({
          head_branch: suite.head_branch,
          created_at: suite.created_at,
        })),
      };
    case "rules":
      return value.map((rule) => ({ type: rule.type, parameters: rule.parameters }));
    case "commit":
      return { commit: { committer: { date: value.commit?.committer?.date } } };
    case "pr":
      return { ...effective(clock)["pr"], ...value };
    default:
      return value;
  }
}
