import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { isRecord } from "./json.js";
import type { TriggerCase, TriggerExpectation, TriggerFixture } from "./types.js";

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

  const cases = value["cases"].map((testCase, index) => validateCase(testCase, fixturePath, index));
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

function validateCase(value: unknown, fixturePath: string, index: number): TriggerCase {
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
  const workspaceFiles = readWorkspaceFiles(value["workspace_files"], fixturePath, index);

  return {
    id,
    prompt,
    expect,
    ...(rationale === undefined ? {} : { rationale }),
    ...(workspaceFiles === undefined ? {} : { workspaceFiles }),
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

function readWorkspaceFiles(
  value: unknown,
  fixturePath: string,
  index: number,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${fixturePath}: expected cases[${index}].workspace_files to be an object.`);
  }

  const files: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(value)) {
    validateWorkspaceFilePath(filePath, fixturePath, index);
    if (typeof content !== "string") {
      throw new Error(
        `${fixturePath}: expected cases[${index}].workspace_files["${filePath}"] to be a string.`,
      );
    }
    files[filePath] = content;
  }

  if (Object.keys(files).length === 0) {
    throw new Error(
      `${fixturePath}: expected cases[${index}].workspace_files to include at least one file.`,
    );
  }

  return files;
}

function validateWorkspaceFilePath(filePath: string, fixturePath: string, index: number): void {
  if (
    filePath.length === 0 ||
    path.isAbsolute(filePath) ||
    filePath.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(
      `${fixturePath}: expected cases[${index}].workspace_files path "${filePath}" to be a safe relative path.`,
    );
  }
}
