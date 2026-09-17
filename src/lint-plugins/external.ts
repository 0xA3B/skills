import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { CODEX_EXTENSION_POINTER } from "./codex-extension.js";
import { type ValidationContext, warning } from "./diagnostics.js";
import { codexInterface } from "./portable-manifest.js";
import { isObject } from "./schema.js";
import type { Catalog, JsonObject } from "./types.js";
import { parseHttpUrlString } from "./urls.js";

const execFileAsync = promisify(execFile);

export async function validateExternalReferences(
  context: ValidationContext,
  catalog: Catalog,
  manifestsByPath: Map<string, JsonObject>,
): Promise<void> {
  if (!context.externalValidationEnabled) {
    return;
  }

  const tasks: Promise<void>[] = [];

  for (const entry of catalog.remoteEntries) {
    const url = typeof entry.source["url"] === "string" ? entry.source["url"] : undefined;
    if (url === undefined) {
      continue;
    }

    tasks.push(
      validateGitRemote(context, url, catalog.marketplacePath, `${entry.pointer}/source/url`),
    );

    const selector =
      typeof entry.source["sha"] === "string"
        ? entry.source["sha"]
        : typeof entry.source["ref"] === "string"
          ? entry.source["ref"]
          : undefined;
    if (selector !== undefined) {
      tasks.push(
        validateGitRemote(
          context,
          url,
          catalog.marketplacePath,
          `${entry.pointer}/source/url`,
          selector,
        ),
      );
    }
  }

  // Every manifest the run parsed is probed, not only those a catalog entry points at: a
  // Claude-only plugin has no Codex entry, yet its portable manifest is authoritative and may carry
  // URLs the Claude extension does not duplicate.
  for (const [manifestPath, manifest] of manifestsByPath) {
    for (const reference of manifestUrlReferences(manifest, manifestPath)) {
      tasks.push(
        validateReachableUrl(context, reference.value, reference.filePath, reference.pointer),
      );
    }
  }

  await Promise.all(tasks);
}

export type UrlReference = {
  filePath: string;
  pointer: string;
  value: unknown;
};

// Every URL-valued field a manifest can carry: the shared metadata URLs, and for a portable
// manifest the Codex extension's interface URLs. Values are returned unchecked so the caller
// decides whether to reach them.
export function manifestUrlReferences(manifest: JsonObject, filePath: string): UrlReference[] {
  const references: UrlReference[] = [
    { filePath, pointer: "/repository", value: manifest["repository"] },
    { filePath, pointer: "/homepage", value: manifest["homepage"] },
  ];

  const author = isObject(manifest["author"]) ? manifest["author"] : undefined;
  if (author !== undefined) {
    references.push({ filePath, pointer: "/author/url", value: author["url"] });
  }

  const manifestInterface = codexInterface(manifest);
  if (manifestInterface !== undefined) {
    for (const fieldName of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      references.push({
        filePath,
        pointer: `${CODEX_EXTENSION_POINTER}/interface/${fieldName}`,
        value: manifestInterface[fieldName],
      });
    }
  }

  return references.filter((reference) => reference.value !== undefined);
}

export async function validateReachableUrl(
  context: ValidationContext,
  value: unknown,
  filePath: string,
  pointer: string,
): Promise<void> {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  const parsedUrl = parseHttpUrlString(context, value, filePath, pointer, "url/http");
  if (parsedUrl === undefined) {
    return;
  }

  const reachable = await fetchUrl(parsedUrl, "HEAD");
  if (reachable) {
    return;
  }

  if (await fetchUrl(parsedUrl, "GET")) {
    return;
  }

  warning(
    context,
    "external/url-reachable",
    filePath,
    `URL did not respond successfully: ${value}`,
    pointer,
  );
}

export async function fetchUrl(url: URL, method: "GET" | "HEAD"): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateGitRemote(
  context: ValidationContext,
  url: string,
  filePath: string,
  pointer: string,
  selector?: string,
): Promise<void> {
  const args = selector === undefined ? ["ls-remote", url] : ["ls-remote", url, selector];

  try {
    const result = await execFileAsync("git", args, { timeout: 15_000 });
    if (selector !== undefined && result.stdout.trim().length === 0) {
      warning(
        context,
        "external/git-selector",
        filePath,
        `Git remote did not contain selector "${selector}": ${url}`,
        pointer,
      );
    }
  } catch {
    warning(
      context,
      "external/git-reachable",
      filePath,
      `Git remote was not reachable: ${url}`,
      pointer,
    );
  }
}
