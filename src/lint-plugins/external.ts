import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { type ValidationContext, warning } from "./diagnostics.js";
import { isObject } from "./schema.js";
import type { Catalog, ClaudeCatalog, JsonObject } from "./types.js";
import { parseHttpUrlString } from "./urls.js";

const execFileAsync = promisify(execFile);

export async function validateExternalReferences(
  context: ValidationContext,
  catalog: Catalog,
  claudeCatalog: ClaudeCatalog,
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

  for (const entry of catalog.localEntries.values()) {
    const manifest = manifestsByPath.get(entry.manifestPath);
    if (manifest === undefined) {
      continue;
    }

    tasks.push(
      validateReachableUrl(context, manifest["repository"], entry.manifestPath, "/repository"),
      validateReachableUrl(context, manifest["homepage"], entry.manifestPath, "/homepage"),
    );

    const author = isObject(manifest["author"]) ? manifest["author"] : undefined;
    if (author !== undefined) {
      tasks.push(validateReachableUrl(context, author["url"], entry.manifestPath, "/author/url"));
    }

    const manifestInterface = isObject(manifest["interface"]) ? manifest["interface"] : undefined;
    if (manifestInterface !== undefined) {
      for (const fieldName of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
        tasks.push(
          validateReachableUrl(
            context,
            manifestInterface[fieldName],
            entry.manifestPath,
            `/interface/${fieldName}`,
          ),
        );
      }
    }
  }

  for (const entry of claudeCatalog.localEntries.values()) {
    const manifest = manifestsByPath.get(entry.manifestPath);
    if (manifest === undefined) {
      continue;
    }

    tasks.push(
      validateReachableUrl(context, manifest["repository"], entry.manifestPath, "/repository"),
      validateReachableUrl(context, manifest["homepage"], entry.manifestPath, "/homepage"),
    );

    const author = isObject(manifest["author"]) ? manifest["author"] : undefined;
    if (author !== undefined) {
      tasks.push(validateReachableUrl(context, author["url"], entry.manifestPath, "/author/url"));
    }
  }

  await Promise.all(tasks);
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
