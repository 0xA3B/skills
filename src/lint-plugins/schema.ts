import { error, type ValidationContext } from "./diagnostics.js";
import type { JsonObject } from "./types.js";

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getObject(
  context: ValidationContext,
  parent: JsonObject,
  key: string,
  filePath: string,
  pointer: string,
): JsonObject | undefined {
  const value = parent[key];

  if (!isObject(value)) {
    error(context, "schema/object", filePath, `Expected "${key}" to be an object.`, pointer);
    return undefined;
  }

  return value;
}

export function getOptionalObject(
  context: ValidationContext,
  parent: JsonObject,
  key: string,
  filePath: string,
  pointer: string,
): JsonObject | undefined {
  const value = parent[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    error(
      context,
      "schema/object",
      filePath,
      `Expected "${key}" to be an object when provided.`,
      pointer,
    );
    return undefined;
  }

  return value;
}

export function getString(
  context: ValidationContext,
  parent: JsonObject,
  key: string,
  filePath: string,
  pointer: string,
): string | undefined {
  const value = parent[key];

  if (typeof value !== "string" || value.length === 0) {
    error(
      context,
      "schema/string",
      filePath,
      `Expected "${key}" to be a non-empty string.`,
      pointer,
    );
    return undefined;
  }

  return value;
}

export function getOptionalString(
  context: ValidationContext,
  parent: JsonObject,
  key: string,
  filePath: string,
  pointer: string,
): string | undefined {
  const value = parent[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    error(
      context,
      "schema/string",
      filePath,
      `Expected "${key}" to be a non-empty string when provided.`,
      pointer,
    );
    return undefined;
  }

  return value;
}

export function getBoolean(
  context: ValidationContext,
  parent: JsonObject,
  key: string,
  filePath: string,
  pointer: string,
): boolean | undefined {
  const value = parent[key];

  if (typeof value !== "boolean") {
    error(context, "schema/boolean", filePath, `Expected "${key}" to be a boolean.`, pointer);
    return undefined;
  }

  return value;
}

export function validateStringArray(
  context: ValidationContext,
  value: unknown,
  key: string,
  filePath: string,
  pointer: string,
  options: { required: boolean },
): string[] | undefined {
  if (value === undefined && !options.required) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    error(
      context,
      "schema/string-array",
      filePath,
      `Expected "${key}" to be a non-empty string array.`,
      pointer,
    );
    return undefined;
  }

  const strings: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.length === 0) {
      error(
        context,
        "schema/string-array",
        filePath,
        `Expected "${key}[${index}]" to be a non-empty string.`,
        `${pointer}/${index}`,
      );
      continue;
    }

    strings.push(item);
  }

  return strings;
}
