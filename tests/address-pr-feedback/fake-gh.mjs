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
    if (/\/commits\/[0-9a-f]+$/u.test(endpoint)) {
      return { key: "commit", filter: jq, passArgs: passed };
    }
    if (/\/issues\/\d+\/comments$/u.test(endpoint)) {
      return { key: "issueComments", filter: jq, passArgs: passed };
    }
    if (/\/issues\/\d+\/reactions$/u.test(endpoint)) {
      return { key: "reactions", filter: jq, passArgs: passed };
    }
  }
  return fail(`no fixture key for: gh ${callArgs.join(" ")}`);
}

// Run the real gh without the filter. A paginated call is slurped so its pages arrive as one JSON
// array; REST pages are flattened, and a multi-page GraphQL result is refused because replay
// serves one page.
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
    return fail(`cannot record a ${parsed.length}-page GraphQL result: gh ${realArgs.join(" ")}`);
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
    case "commit":
      return { commit: { committer: { date: value.commit?.committer?.date } } };
    case "pr":
      return { ...effective(clock)["pr"], ...value };
    default:
      return value;
  }
}
