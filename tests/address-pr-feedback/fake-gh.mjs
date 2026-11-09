#!/usr/bin/env node
// A stand-in for `gh` that replays the GitHub responses a poll script reads, one snapshot per
// elapsed `sleep`, or records them from the real `gh`. Both modes keep their state in FAKE_GH_DIR:
// `scenario.json` holds `{ "snapshots": [ { "<key>": <data>, ... }, ... ] }`, and `clock` counts
// the sleeps so far. Snapshot n holds only the keys that changed at clock n; a read at clock c sees
// every key's latest value at or before c. `--jq` and `-q` filters run through `jq -r -c`, which
// matches how `gh` prints a filter's strings raw.
//
// Replay: FAKE_GH_DIR=<dir> gh <args>
// Record: FAKE_GH_DIR=<dir> FAKE_GH_REAL=<path to the real gh> gh <args>
//
// A call the stub cannot map to a fixture key fails with a message naming the call, so a script
// change that reads a new endpoint shows up as a failing test instead of an empty response.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env["FAKE_GH_DIR"];
if (!dir) {
  fail("FAKE_GH_DIR is not set");
}
const args = process.argv.slice(2);
const real = process.env["FAKE_GH_REAL"];

// The timeline events poll-copilot.sh reads; recording drops the rest.
const TIMELINE_EVENTS = new Set([
  "automatic_base_change_succeeded",
  "base_ref_changed",
  "ready_for_review",
  "review_requested",
]);

const { key, filter, passArgs } = parseCall(args);
const scenarioPath = path.join(dir, "scenario.json");
const scenario = readScenario();
const clock = readClock();

let data;
if (real) {
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

if (filter === undefined) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
} else {
  try {
    process.stdout.write(
      execFileSync("jq", ["-r", "-c", filter], { input: JSON.stringify(data), encoding: "utf8" }),
    );
  } catch (jqError) {
    process.stderr.write(String(jqError.stderr ?? jqError));
    process.exit(1);
  }
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

// The fixture key for a call, its jq filter, and the arguments to pass to the real gh.
function parseCall(callArgs) {
  const passed = [];
  let jq;
  let query = "";
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
      if (value?.startsWith("query=")) {
        query = value;
      }
      continue;
    }
    if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  const [command, subcommand] = positional;
  if (command === "pr" && subcommand === "view") {
    return { key: "pr", filter: jq, passArgs: passed };
  }
  if (command === "api" && subcommand === "graphql") {
    if (query.includes("HEAD_REF_FORCE_PUSHED_EVENT")) {
      return { key: "forcePushes", filter: jq, passArgs: passed };
    }
    if (query.includes("reviewThreads")) {
      return { key: "reviewThreads", filter: jq, passArgs: passed };
    }
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
        return { key: endpointKey, filter: jq, passArgs: passed };
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
