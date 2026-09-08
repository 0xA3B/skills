import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { isRecord } from "./json.js";
import { isSafeWorkspaceFilePath, SEED_NAME_PATTERN } from "./seeds.js";
import type { TriggerCase, TriggerExpectation, TriggerFixture, WorkspaceSpec } from "./types.js";

type FixtureOptions = {
  // Case ids to keep, in any order; the result keeps fixture order.
  caseIds?: string[];
};

// One schema problem in a fixture: the pointer names the offending key in the fixture's own
// vocabulary (cases[3].workspace.seed; file-map keys are JSON-quoted, as in
// workspace_files["src/a.ts"]) and the message repeats it so the text stands alone.
export type FixtureFinding = {
  pointer: string;
  message: string;
};

export type ParsedTriggerFixture = {
  // Present only when the fixture has no findings.
  fixture: TriggerFixture | undefined;
  findings: FixtureFinding[];
};

// Loads a fixture for a run: every finding is aggregated into one error so a fixture author sees
// the whole list at once. The plugin linter uses parseTriggerFixture directly and maps each
// finding to a diagnostic.
export async function loadTriggerFixture(
  fixturePath: string,
  options: FixtureOptions = {},
): Promise<TriggerFixture> {
  const { fixture, findings } = parseTriggerFixture(await readFile(fixturePath, "utf8"));
  if (fixture === undefined) {
    throw new Error(findings.map((finding) => `${fixturePath}: ${finding.message}`).join("\n"));
  }

  if (options.caseIds === undefined) {
    return fixture;
  }
  if (options.caseIds.length === 0) {
    throw new Error("caseIds must name at least one case; omit it to run every case.");
  }

  const requested = new Set(options.caseIds);
  const selectedCases = fixture.cases.filter((testCase) => requested.has(testCase.id));
  for (const testCase of selectedCases) {
    requested.delete(testCase.id);
  }
  for (const caseId of requested) {
    throw new Error(`No trigger fixture case found with id "${caseId}".`);
  }

  return { ...fixture, cases: selectedCases };
}

// Parses fixture text and collects every schema finding instead of stopping at the first.
// Invalid YAML is one finding. A cascade from one bad value is suppressed rather than reported:
// a case whose expect is unreadable cannot count toward the invoke and skip presence checks.
export function parseTriggerFixture(content: string): ParsedTriggerFixture {
  const findings: FixtureFinding[] = [];
  const report: Report = (pointer, message) => {
    findings.push({ pointer, message });
  };

  let value: unknown;
  try {
    value = parseYaml(content);
  } catch (caught) {
    report("", `invalid YAML: ${caught instanceof Error ? caught.message : String(caught)}`);
    return { fixture: undefined, findings };
  }

  const fixture = validateFixture(value, report);
  return { fixture: findings.length === 0 ? fixture : undefined, findings };
}

type Report = (pointer: string, message: string) => void;

function validateFixture(value: unknown, report: Report): TriggerFixture | undefined {
  if (!isRecord(value)) {
    report("", "expected fixture root to be an object.");
    return undefined;
  }

  if (value["version"] !== 1) {
    report("version", "expected version: 1.");
  }

  const defaultWorkspace = readWorkspaceSpec(value["workspace"], report, "workspace");
  if (defaultWorkspace === "none") {
    report("workspace", "expected workspace to be an object.");
  }
  const defaultWorkspaceFiles = readWorkspaceFiles(
    value["workspace_files"],
    report,
    "workspace_files",
  );

  if (!Array.isArray(value["cases"]) || value["cases"].length === 0) {
    report("cases", "expected cases to be a non-empty list.");
    return undefined;
  }

  const defaults: FixtureDefaults = {
    defaultWorkspace: defaultWorkspace === "none" ? undefined : defaultWorkspace,
    defaultWorkspaceFiles,
  };
  const cases: TriggerCase[] = [];
  let everyExpectationRead = true;
  const ids = new Set<string>();
  value["cases"].forEach((testCase, index) => {
    const parsedCase = validateCase(testCase, report, index, defaults);
    if (!parsedCase.expectationRead) {
      everyExpectationRead = false;
    }
    if (parsedCase.testCase === undefined) {
      return;
    }
    if (ids.has(parsedCase.testCase.id)) {
      report(`cases[${index}].id`, `duplicate case id "${parsedCase.testCase.id}".`);
    }
    ids.add(parsedCase.testCase.id);
    cases.push(parsedCase.testCase);
  });

  if (everyExpectationRead) {
    if (!cases.some((testCase) => testCase.expect === "invoke")) {
      report("cases", "expected at least one case with expect: invoke.");
    }
    if (!cases.some((testCase) => testCase.expect === "skip")) {
      report("cases", "expected at least one case with expect: skip.");
    }
  }

  return {
    version: 1,
    cases,
    ...(defaults.defaultWorkspace === undefined ? {} : { workspace: defaults.defaultWorkspace }),
  };
}

type FixtureDefaults = {
  defaultWorkspace: WorkspaceSpec | undefined;
  defaultWorkspaceFiles: Record<string, string> | undefined;
};

type ParsedCase = {
  testCase: TriggerCase | undefined;
  expectationRead: boolean;
};

function validateCase(
  value: unknown,
  report: Report,
  index: number,
  defaults: FixtureDefaults,
): ParsedCase {
  const location = `cases[${index}]`;
  if (!isRecord(value)) {
    report(location, `expected ${location} to be an object.`);
    return { testCase: undefined, expectationRead: false };
  }

  const id = readString(value, "id", report, location);
  if (id !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(id)) {
    report(
      `${location}.id`,
      `expected ${location}.id to be 1-80 lowercase letters, numbers, or hyphens.`,
    );
  }

  const prompt = readString(value, "prompt", report, location);
  const expect = readExpectation(value["expect"], report, location);
  const rationale = value["rationale"];
  if (rationale !== undefined && (typeof rationale !== "string" || rationale.length === 0)) {
    report(
      `${location}.rationale`,
      `expected ${location}.rationale to be a non-empty string when provided.`,
    );
  }
  const invokeInstead = readInvokeInstead(value["invoke-instead"], expect, report, location);
  // A case workspace replaces the fixture default wholesale; "none" opts out of it.
  const caseWorkspace = readWorkspaceSpec(value["workspace"], report, `${location}.workspace`);
  const workspace =
    caseWorkspace === "none" ? undefined : (caseWorkspace ?? defaults.defaultWorkspace);
  // Unstaged files merge per path, the case's own entries winning.
  const caseWorkspaceFiles = readWorkspaceFiles(
    value["workspace_files"],
    report,
    `${location}.workspace_files`,
  );
  const workspaceFiles =
    defaults.defaultWorkspaceFiles === undefined && caseWorkspaceFiles === undefined
      ? undefined
      : { ...defaults.defaultWorkspaceFiles, ...caseWorkspaceFiles };

  if (id === undefined || prompt === undefined || expect === undefined) {
    return { testCase: undefined, expectationRead: expect !== undefined };
  }

  return {
    expectationRead: true,
    testCase: {
      id,
      prompt,
      expect,
      ...(typeof rationale === "string" && rationale.length > 0 ? { rationale } : {}),
      ...(invokeInstead === undefined ? {} : { invokeInstead }),
      ...(workspace === undefined ? {} : { workspace }),
      ...(workspaceFiles === undefined ? {} : { workspaceFiles }),
    },
  };
}

// The labels skillTargetLabel emits: kebab-case names, joined by one colon for a plugin skill.
const SKILL_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/;

// Spec: "invoke-instead: <label> is valid only on expect: skip cases." Whether the label names an
// existing, implicitly invokable skill of the fixture's own kind is the plugin linter's
// cross-reference check.
function readInvokeInstead(
  value: unknown,
  expect: TriggerExpectation | undefined,
  report: Report,
  location: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !SKILL_LABEL_PATTERN.test(value)) {
    report(
      `${location}.invoke-instead`,
      `expected ${location}.invoke-instead to be a skill label: <plugin>:<skill> or a bare repo-local skill name.`,
    );
    return undefined;
  }
  if (expect === "invoke") {
    report(
      `${location}.invoke-instead`,
      `expected ${location}.invoke-instead only on expect: skip cases.`,
    );
    return undefined;
  }

  return value;
}

const BRANCH_NAME_CHARACTERS = /^[A-Za-z0-9._/-]+$/;

// The structural rules of git check-ref-format --branch, applied at load time so a bad fixture
// fails with the fixture path instead of aborting workspace staging.
function isGitBranchName(name: string): boolean {
  return (
    BRANCH_NAME_CHARACTERS.test(name) &&
    name !== "HEAD" &&
    !name.startsWith("-") &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.endsWith(".") &&
    !name.includes("..") &&
    !name.includes("//") &&
    name.split("/").every((component) => !component.startsWith(".") && !component.endsWith(".lock"))
  );
}

function readWorkspaceSpec(
  value: unknown,
  report: Report,
  location: string,
): WorkspaceSpec | "none" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "none") {
    return "none";
  }
  if (!isRecord(value)) {
    report(location, `expected ${location} to be an object or "none".`);
    return undefined;
  }

  const seed = value["seed"];
  if (typeof seed !== "string" || !SEED_NAME_PATTERN.test(seed)) {
    report(`${location}.seed`, `expected ${location}.seed to be a kebab-case seed name.`);
  }
  const branch = value["branch"] ?? "main";
  if (typeof branch !== "string" || !isGitBranchName(branch)) {
    report(`${location}.branch`, `expected ${location}.branch to be a git branch name.`);
  }
  const committed = readWorkspaceFiles(value["committed"], report, `${location}.committed`) ?? {};
  const staged = readWorkspaceFiles(value["staged"], report, `${location}.staged`) ?? {};

  if (typeof seed !== "string" || typeof branch !== "string") {
    return undefined;
  }

  return { seed, branch, committed, staged };
}

function readString(
  value: Record<string, unknown>,
  key: string,
  report: Report,
  location: string,
): string | undefined {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    report(`${location}.${key}`, `expected ${location}.${key} to be a non-empty string.`);
    return undefined;
  }

  return field;
}

function readExpectation(
  value: unknown,
  report: Report,
  location: string,
): TriggerExpectation | undefined {
  if (value !== "invoke" && value !== "skip") {
    report(`${location}.expect`, `expected ${location}.expect to be invoke or skip.`);
    return undefined;
  }

  return value;
}

// Shared by every file map in the schema: workspace_files at both levels, and the committed and
// staged layers of a workspace block. The location names the map in diagnostics. Entries that fail
// are dropped so the rest of the fixture still parses for further findings.
function readWorkspaceFiles(
  value: unknown,
  report: Report,
  location: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    report(location, `expected ${location} to be an object.`);
    return undefined;
  }

  const files: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(value)) {
    if (!isSafeWorkspaceFilePath(filePath)) {
      report(
        `${location}[${JSON.stringify(filePath)}]`,
        `expected ${location} path "${filePath}" to be a safe relative path outside .git, .agents, and .claude.`,
      );
      continue;
    }
    if (typeof content !== "string") {
      report(
        `${location}[${JSON.stringify(filePath)}]`,
        `expected ${location}["${filePath}"] to be a string.`,
      );
      continue;
    }
    // An own data property even for "__proto__", which plain assignment would route to the setter.
    Object.defineProperty(files, filePath, {
      value: content,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return files;
}
