import { readFile, stat } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { error, type ValidationContext } from "./diagnostics.js";
import { isObject } from "./schema.js";
import type { JsonObject } from "./types.js";
import { errorMessage } from "./utils.js";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function readJsonObject(
  context: ValidationContext,
  filePath: string,
): Promise<JsonObject | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));

    if (!isObject(parsed)) {
      error(context, "schema/root-object", filePath, "Expected root value to be an object.");
      return undefined;
    }

    return parsed;
  } catch (readError) {
    error(context, "parse/json", filePath, `Unable to parse JSON: ${errorMessage(readError)}`);
    return undefined;
  }
}

export async function readYamlObject(
  context: ValidationContext,
  filePath: string,
): Promise<JsonObject | undefined> {
  try {
    const parsed: unknown = parseYaml(await readFile(filePath, "utf8"));

    if (!isObject(parsed)) {
      error(context, "schema/root-object", filePath, "Expected root value to be an object.");
      return undefined;
    }

    return parsed;
  } catch (readError) {
    error(context, "parse/yaml", filePath, `Unable to parse YAML: ${errorMessage(readError)}`);
    return undefined;
  }
}
