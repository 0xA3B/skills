import path from "node:path";

import { error, type ValidationContext } from "./diagnostics.js";
import { isFile, isDirectory, readJsonObject } from "./files.js";
import { resolveRelativePath } from "./paths.js";
import {
  getOptionalObject,
  getOptionalString,
  getString,
  isObject,
  validateStringArray,
} from "./schema.js";
import type { ComponentPathRule, JsonObject, LocalCatalogEntry } from "./types.js";
import { validateUrlString } from "./urls.js";

// The manifest-field contract shared by the Codex and Claude plugin manifests. Both validators
// call this so field, alignment, and author rules cannot drift between the two targets.
export function validateCommonManifestFields(
  context: ValidationContext,
  manifest: JsonObject,
  entry: { name: string; manifestPath: string; pluginPath: string },
): { author?: JsonObject } {
  const manifestName = getString(context, manifest, "name", entry.manifestPath, "/name");
  getString(context, manifest, "version", entry.manifestPath, "/version");
  getString(context, manifest, "description", entry.manifestPath, "/description");

  const repository = getOptionalString(
    context,
    manifest,
    "repository",
    entry.manifestPath,
    "/repository",
  );
  validateUrlString(context, repository, entry.manifestPath, "/repository", "url/http");

  const homepage = getOptionalString(
    context,
    manifest,
    "homepage",
    entry.manifestPath,
    "/homepage",
  );
  validateUrlString(context, homepage, entry.manifestPath, "/homepage", "url/http");

  if (manifestName !== undefined && manifestName !== entry.name) {
    error(
      context,
      "alignment/name",
      entry.manifestPath,
      `Manifest name "${manifestName}" does not match marketplace name "${entry.name}".`,
      "/name",
    );
  }

  if (manifestName !== undefined && path.basename(entry.pluginPath) !== manifestName) {
    error(
      context,
      "alignment/directory-name",
      entry.manifestPath,
      `Plugin directory "${path.basename(entry.pluginPath)}" does not match manifest name "${manifestName}".`,
      "/name",
    );
  }

  const author = getOptionalObject(context, manifest, "author", entry.manifestPath, "/author");
  if (author !== undefined) {
    getString(context, author, "name", entry.manifestPath, "/author/name");
    const authorUrl = getOptionalString(context, author, "url", entry.manifestPath, "/author/url");
    validateUrlString(context, authorUrl, entry.manifestPath, "/author/url", "url/http");
    getOptionalString(context, author, "email", entry.manifestPath, "/author/email");
  }

  getOptionalString(context, manifest, "license", entry.manifestPath, "/license");
  validateStringArray(context, manifest["keywords"], "keywords", entry.manifestPath, "/keywords", {
    required: false,
  });

  return author === undefined ? {} : { author };
}

export async function validatePlugin(
  context: ValidationContext,
  entry: LocalCatalogEntry,
): Promise<JsonObject | undefined> {
  const manifest = await readJsonObject(context, entry.manifestPath);

  if (manifest === undefined) {
    return undefined;
  }

  validateCommonManifestFields(context, manifest, entry);

  const manifestInterface = getOptionalObject(
    context,
    manifest,
    "interface",
    entry.manifestPath,
    "/interface",
  );
  if (manifestInterface !== undefined) {
    validatePluginInterface(context, manifestInterface, entry);
  }

  await validateComponentPaths(context, manifest, entry);
  return manifest;
}

export function validatePluginInterface(
  context: ValidationContext,
  manifestInterface: JsonObject,
  entry: LocalCatalogEntry,
): void {
  getString(
    context,
    manifestInterface,
    "displayName",
    entry.manifestPath,
    "/interface/displayName",
  );
  getString(
    context,
    manifestInterface,
    "shortDescription",
    entry.manifestPath,
    "/interface/shortDescription",
  );
  getString(
    context,
    manifestInterface,
    "longDescription",
    entry.manifestPath,
    "/interface/longDescription",
  );
  getString(
    context,
    manifestInterface,
    "developerName",
    entry.manifestPath,
    "/interface/developerName",
  );
  const interfaceCategory = getString(
    context,
    manifestInterface,
    "category",
    entry.manifestPath,
    "/interface/category",
  );

  if (
    entry.category !== undefined &&
    interfaceCategory !== undefined &&
    entry.category !== interfaceCategory
  ) {
    error(
      context,
      "alignment/category",
      entry.manifestPath,
      `Plugin interface category "${interfaceCategory}" does not match marketplace category "${entry.category}".`,
      "/interface/category",
    );
  }

  validateStringArray(
    context,
    manifestInterface["capabilities"],
    "interface.capabilities",
    entry.manifestPath,
    "/interface/capabilities",
    { required: true },
  );
  const defaultPrompts = validateStringArray(
    context,
    manifestInterface["defaultPrompt"],
    "interface.defaultPrompt",
    entry.manifestPath,
    "/interface/defaultPrompt",
    { required: false },
  );
  if (defaultPrompts !== undefined && defaultPrompts.length > 3) {
    error(
      context,
      "manifest/default-prompt-limit",
      entry.manifestPath,
      "Expected interface.defaultPrompt to contain 3 or fewer prompts because Codex UI surfaces only the first 3.",
      "/interface/defaultPrompt",
    );
  }

  for (const fieldName of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const url = getOptionalString(
      context,
      manifestInterface,
      fieldName,
      entry.manifestPath,
      `/interface/${fieldName}`,
    );
    validateUrlString(context, url, entry.manifestPath, `/interface/${fieldName}`, "url/http");
  }

  const brandColor = getOptionalString(
    context,
    manifestInterface,
    "brandColor",
    entry.manifestPath,
    "/interface/brandColor",
  );
  if (brandColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    error(
      context,
      "manifest/brand-color",
      entry.manifestPath,
      "Expected interface.brandColor to be a 6-digit hex color.",
      "/interface/brandColor",
    );
  }
}

export async function validateComponentPaths(
  context: ValidationContext,
  manifest: JsonObject,
  entry: LocalCatalogEntry,
): Promise<void> {
  const pathRules: ComponentPathRule[] = [
    {
      expectedKind: "directory",
      fieldName: "skills",
      pointer: "/skills",
      value: manifest["skills"],
    },
    {
      expectedKind: "file",
      fieldName: "mcpServers",
      pointer: "/mcpServers",
      value: manifest["mcpServers"],
    },
    {
      expectedKind: "file",
      fieldName: "apps",
      pointer: "/apps",
      value: manifest["apps"],
    },
  ];

  const manifestInterface = isObject(manifest["interface"]) ? manifest["interface"] : undefined;
  if (manifestInterface !== undefined) {
    pathRules.push(
      {
        expectedKind: "file",
        fieldName: "interface.composerIcon",
        pointer: "/interface/composerIcon",
        value: manifestInterface["composerIcon"],
      },
      {
        expectedKind: "file",
        fieldName: "interface.logo",
        pointer: "/interface/logo",
        value: manifestInterface["logo"],
      },
    );

    if (manifestInterface["screenshots"] !== undefined) {
      const screenshots = validateStringArray(
        context,
        manifestInterface["screenshots"],
        "interface.screenshots",
        entry.manifestPath,
        "/interface/screenshots",
        { required: true },
      );
      if (screenshots !== undefined) {
        for (const [index, screenshot] of screenshots.entries()) {
          pathRules.push({
            expectedKind: "file",
            fieldName: `interface.screenshots[${index}]`,
            pointer: `/interface/screenshots/${index}`,
            value: screenshot,
          });
        }
      }
    }
  }

  await validateManifestPathRules(context, pathRules, entry);
  await validateHooksPath(context, manifest["hooks"], entry);
}

export async function validateManifestPathRules(
  context: ValidationContext,
  pathRules: ComponentPathRule[],
  entry: LocalCatalogEntry,
): Promise<void> {
  for (const rule of pathRules) {
    if (rule.value === undefined) {
      if (rule.fieldName === "skills") {
        error(
          context,
          "manifest/required-path",
          entry.manifestPath,
          'Expected "skills" to be provided.',
          rule.pointer,
        );
      }
      continue;
    }

    if (typeof rule.value !== "string" || rule.value.length === 0) {
      error(
        context,
        "manifest/path-type",
        entry.manifestPath,
        `Expected "${rule.fieldName}" to be a non-empty string path.`,
        rule.pointer,
      );
      continue;
    }

    const resolved = resolveRelativePath(
      context,
      rule.value,
      entry.pluginPath,
      entry.manifestPath,
      rule.pointer,
      "manifest/path",
    );
    if (resolved === undefined) {
      continue;
    }

    if (rule.expectedKind === "directory" && !(await isDirectory(resolved))) {
      error(
        context,
        "manifest/path-exists",
        entry.manifestPath,
        `Expected "${rule.fieldName}" to point to an existing directory: ${rule.value}`,
        rule.pointer,
      );
    }

    if (rule.expectedKind === "file" && !(await isFile(resolved))) {
      error(
        context,
        "manifest/path-exists",
        entry.manifestPath,
        `Expected "${rule.fieldName}" to point to an existing file: ${rule.value}`,
        rule.pointer,
      );
    }
  }
}

export async function validateHooksPath(
  context: ValidationContext,
  value: unknown,
  entry: LocalCatalogEntry,
): Promise<void> {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    await validateManifestPathRules(
      context,
      [{ expectedKind: "file", fieldName: "hooks", pointer: "/hooks", value }],
      entry,
    );
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (typeof item === "string") {
        await validateManifestPathRules(
          context,
          [
            {
              expectedKind: "file",
              fieldName: `hooks[${index}]`,
              pointer: `/hooks/${index}`,
              value: item,
            },
          ],
          entry,
        );
      } else if (!isObject(item)) {
        error(
          context,
          "manifest/hooks",
          entry.manifestPath,
          "Expected hooks array items to be file paths or inline lifecycle objects.",
          `/hooks/${index}`,
        );
      }
    }
    return;
  }

  if (!isObject(value)) {
    error(
      context,
      "manifest/hooks",
      entry.manifestPath,
      "Expected hooks to be a file path, inline lifecycle object, or array of those values.",
      "/hooks",
    );
  }
}
