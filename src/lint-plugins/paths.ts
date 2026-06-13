import path from "node:path";

import { error, type ValidationContext } from "./diagnostics.js";

export function relativeDisplay(
  context: ValidationContext,
  filePath: string,
  pointer?: string,
): string {
  const relativePath = path.relative(context.repoRoot, filePath);
  return pointer === undefined ? relativePath : `${relativePath}${pointer}`;
}

function isInside(baseDir: string, targetPath: string): boolean {
  const relativePath = path.relative(baseDir, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function resolveRelativePath(
  context: ValidationContext,
  reference: string,
  baseDir: string,
  filePath: string,
  pointer: string,
  ruleId: string,
): string | undefined {
  if (!reference.startsWith("./")) {
    error(context, ruleId, filePath, `Path must start with "./": ${reference}`, pointer);
    return undefined;
  }

  if (path.isAbsolute(reference)) {
    error(context, ruleId, filePath, `Path must be relative, not absolute: ${reference}`, pointer);
    return undefined;
  }

  const resolved = path.resolve(baseDir, reference);
  if (!isInside(baseDir, resolved)) {
    const baseLabel = path.relative(context.repoRoot, baseDir) || ".";
    error(context, ruleId, filePath, `Path must stay inside ${baseLabel}: ${reference}`, pointer);
    return undefined;
  }

  return resolved;
}

export function marketplaceRootFromPath(marketplacePath: string): string {
  return path.resolve(path.dirname(marketplacePath), "..", "..");
}
