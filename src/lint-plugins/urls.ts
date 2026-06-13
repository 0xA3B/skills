import { error, type ValidationContext } from "./diagnostics.js";

export function parseHttpUrlString(
  context: ValidationContext,
  value: string | undefined,
  filePath: string,
  pointer: string,
  ruleId: string,
): URL | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      error(context, ruleId, filePath, `Expected an HTTP(S) URL: ${value}`, pointer);
      return undefined;
    }

    return parsedUrl;
  } catch {
    error(context, ruleId, filePath, `Expected a valid URL: ${value}`, pointer);
    return undefined;
  }
}

export function validateUrlString(
  context: ValidationContext,
  value: string | undefined,
  filePath: string,
  pointer: string,
  ruleId: string,
): void {
  parseHttpUrlString(context, value, filePath, pointer, ruleId);
}

export function validateGitUrlString(
  context: ValidationContext,
  value: string | undefined,
  filePath: string,
  pointer: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value.startsWith("git@") ||
    value.startsWith("ssh://") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  ) {
    return value;
  }

  error(context, "url/git", filePath, `Expected a Git URL or SSH Git shorthand: ${value}`, pointer);
  return undefined;
}
