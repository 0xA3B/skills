import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { isRecord } from "./json.js";
import { isSafeWorkspaceFilePath, SEED_NAME_PATTERN } from "./seeds.js";
import type { TriggerCase, TriggerExpectation, TriggerFixture, WorkspaceSpec } from "./types.js";

type FixtureOptions = {
  caseId?: string;
};

export async function loadTriggerFixture(
  fixturePath: string,
  options: FixtureOptions = {},
): Promise<TriggerFixture> {
  const parsed = parseYaml(await readFile(fixturePath, "utf8")) as unknown;
  const fixture = validateFixture(parsed, fixturePath);

  if (options.caseId === undefined) {
    return fixture;
  }

  const selectedCases = fixture.cases.filter((testCase) => testCase.id === options.caseId);
  if (selectedCases.length === 0) {
    throw new Error(`No trigger fixture case found with id "${options.caseId}".`);
  }

  return { ...fixture, cases: selectedCases };
}

function validateFixture(value: unknown, fixturePath: string): TriggerFixture {
  if (!isRecord(value)) {
    throw new Error(`${fixturePath}: expected fixture root to be an object.`);
  }

  if (value["version"] !== 1) {
    throw new Error(`${fixturePath}: expected version: 1.`);
  }

  if (!Array.isArray(value["cases"]) || value["cases"].length === 0) {
    throw new Error(`${fixturePath}: expected cases to be a non-empty list.`);
  }

  const defaultWorkspace = readWorkspaceSpec(value["workspace"], fixturePath, "workspace");
  if (defaultWorkspace === "none") {
    throw new Error(`${fixturePath}: expected workspace to be an object.`);
  }
  const defaultWorkspaceFiles = readWorkspaceFiles(
    value["workspace_files"],
    fixturePath,
    "workspace_files",
  );
  const cases = value["cases"].map((testCase, index) =>
    validateCase(testCase, fixturePath, index, { defaultWorkspace, defaultWorkspaceFiles }),
  );
  const ids = new Set<string>();
  for (const testCase of cases) {
    if (ids.has(testCase.id)) {
      throw new Error(`${fixturePath}: duplicate case id "${testCase.id}".`);
    }
    ids.add(testCase.id);
  }

  if (!cases.some((testCase) => testCase.expect === "invoke")) {
    throw new Error(`${fixturePath}: expected at least one case with expect: invoke.`);
  }

  if (!cases.some((testCase) => testCase.expect === "skip")) {
    throw new Error(`${fixturePath}: expected at least one case with expect: skip.`);
  }

  return { version: 1, cases };
}

type FixtureDefaults = {
  defaultWorkspace: WorkspaceSpec | undefined;
  defaultWorkspaceFiles: Record<string, string> | undefined;
};

function validateCase(
  value: unknown,
  fixturePath: string,
  index: number,
  defaults: FixtureDefaults,
): TriggerCase {
  if (!isRecord(value)) {
    throw new Error(`${fixturePath}: expected cases[${index}] to be an object.`);
  }

  const id = readString(value, "id", fixturePath, index);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(id)) {
    throw new Error(
      `${fixturePath}: expected cases[${index}].id to be 1-80 lowercase letters, numbers, or hyphens.`,
    );
  }

  const prompt = readString(value, "prompt", fixturePath, index);
  const expect = readExpectation(value["expect"], fixturePath, index);
  const rationale = value["rationale"];
  if (rationale !== undefined && (typeof rationale !== "string" || rationale.length === 0)) {
    throw new Error(
      `${fixturePath}: expected cases[${index}].rationale to be a non-empty string when provided.`,
    );
  }
  // A case workspace replaces the fixture default wholesale; "none" opts out of it.
  const caseWorkspace = readWorkspaceSpec(
    value["workspace"],
    fixturePath,
    `cases[${index}].workspace`,
  );
  const workspace =
    caseWorkspace === "none" ? undefined : (caseWorkspace ?? defaults.defaultWorkspace);
  // Unstaged files merge per path, the case's own entries winning.
  const caseWorkspaceFiles = readWorkspaceFiles(
    value["workspace_files"],
    fixturePath,
    `cases[${index}].workspace_files`,
  );
  const workspaceFiles =
    defaults.defaultWorkspaceFiles === undefined && caseWorkspaceFiles === undefined
      ? undefined
      : { ...defaults.defaultWorkspaceFiles, ...caseWorkspaceFiles };

  return {
    id,
    prompt,
    expect,
    ...(rationale === undefined ? {} : { rationale }),
    ...(workspace === undefined ? {} : { workspace }),
    ...(workspaceFiles === undefined ? {} : { workspaceFiles }),
  };
}

const BRANCH_NAME_CHARACTERS = /^[A-Za-z0-9._/-]+$/;

// The structural rules of git check-ref-format --branch, applied at load time so a bad fixture
// fails with the fixture path instead of aborting workspace staging.
function isGitBranchName(name: string): boolean {
  return (
    BRANCH_NAME_CHARACTERS.test(name) &&
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
  fixturePath: string,
  location: string,
): WorkspaceSpec | "none" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "none") {
    return "none";
  }
  if (!isRecord(value)) {
    throw new Error(`${fixturePath}: expected ${location} to be an object or "none".`);
  }

  const seed = value["seed"];
  if (typeof seed !== "string" || !SEED_NAME_PATTERN.test(seed)) {
    throw new Error(`${fixturePath}: expected ${location}.seed to be a kebab-case seed name.`);
  }
  const branch = value["branch"] ?? "main";
  if (typeof branch !== "string" || !isGitBranchName(branch)) {
    throw new Error(`${fixturePath}: expected ${location}.branch to be a git branch name.`);
  }

  return {
    seed,
    branch,
    committed: readWorkspaceFiles(value["committed"], fixturePath, `${location}.committed`) ?? {},
    staged: readWorkspaceFiles(value["staged"], fixturePath, `${location}.staged`) ?? {},
  };
}

function readString(
  value: Record<string, unknown>,
  key: string,
  fixturePath: string,
  index: number,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`${fixturePath}: expected cases[${index}].${key} to be a non-empty string.`);
  }

  return field;
}

function readExpectation(value: unknown, fixturePath: string, index: number): TriggerExpectation {
  if (value !== "invoke" && value !== "skip") {
    throw new Error(`${fixturePath}: expected cases[${index}].expect to be invoke or skip.`);
  }

  return value;
}

// Shared by every file map in the schema: workspace_files at both levels, and the committed and
// staged layers of a workspace block. The location names the map in diagnostics.
function readWorkspaceFiles(
  value: unknown,
  fixturePath: string,
  location: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${fixturePath}: expected ${location} to be an object.`);
  }

  const files: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(value)) {
    validateWorkspaceFilePath(filePath, fixturePath, location);
    if (typeof content !== "string") {
      throw new Error(`${fixturePath}: expected ${location}["${filePath}"] to be a string.`);
    }
    files[filePath] = content;
  }

  return files;
}

// The path rule lives beside the writer in seeds.ts; the loader adds the fixture diagnostics.
function validateWorkspaceFilePath(filePath: string, fixturePath: string, location: string): void {
  if (!isSafeWorkspaceFilePath(filePath)) {
    throw new Error(
      `${fixturePath}: expected ${location} path "${filePath}" to be a safe relative path outside .git, .agents, and .claude.`,
    );
  }
}
