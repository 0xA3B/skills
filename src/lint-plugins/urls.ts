import { error, type ValidationContext } from "./diagnostics.js";

export function validateUrlString(
  context: ValidationContext,
  value: string | undefined,
  filePath: string,
  pointer: string,
  ruleId: string,
): void {
  if (value === undefined) {
    return;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      error(context, ruleId, filePath, `Expected an HTTP(S) URL: ${value}`, pointer);
    }
  } catch {
    error(context, ruleId, filePath, `Expected a valid URL: ${value}`, pointer);
  }
}
