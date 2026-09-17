import { readFile } from "node:fs/promises";
import path from "node:path";

import { CODEX_EXTENSION_POINTER, validateCodexExtension } from "./codex-extension.js";
import { error, type ValidationContext } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import { validateCommonManifestFields } from "./manifest-fields.js";
import { getObject, getOptionalObject, isObject } from "./schema.js";
import {
  CODEX_EXTENSION_NAMESPACE,
  PORTABLE_MANIFEST_AUTHOR_KEYS,
  PORTABLE_MANIFEST_KEYS,
  PORTABLE_MANIFEST_NAME_MAX_LENGTH,
  PORTABLE_MANIFEST_NAME_PATTERN,
  PORTABLE_MANIFEST_SCHEMA_URL,
} from "./specs.js";
import type { JsonObject } from "./types.js";

// The portable manifest: plugin.json at the plugin root, the one manifest every plugin ships and
// the authoritative source for fields the target extensions duplicate. Rules follow Agent Plugins
// 1.0.0 (see specs.ts for the schema URL) plus the repository decisions noted inline.
export type PortableManifestOptions = {
  // The plugin's name in the Codex marketplace catalog, when the catalog lists it.
  catalogName?: string | undefined;
  // The plugin's category in the Codex marketplace catalog, when the catalog lists it.
  category?: string | undefined;
  pluginPath: string;
};

export type PortableManifestResult = {
  codexExtension: JsonObject | undefined;
  manifest: JsonObject;
};

export function portableManifestPath(pluginPath: string): string {
  return path.join(pluginPath, "plugin.json");
}

export function codexExtension(manifest: JsonObject): JsonObject | undefined {
  const extensions = manifest["extensions"];
  if (!isObject(extensions)) {
    return undefined;
  }
  const extension = extensions[CODEX_EXTENSION_NAMESPACE];
  return isObject(extension) ? extension : undefined;
}

export function codexInterface(manifest: JsonObject): JsonObject | undefined {
  const manifestInterface = codexExtension(manifest)?.["interface"];
  return isObject(manifestInterface) ? manifestInterface : undefined;
}

// Quiet read for callers that only need to know whether a plugin targets Codex; the portable
// manifest's own validation reports parse and schema problems.
export async function readCodexExtension(pluginPath: string): Promise<JsonObject | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(portableManifestPath(pluginPath), "utf8"));
    return isObject(parsed) ? codexExtension(parsed) : undefined;
  } catch {
    return undefined;
  }
}

export async function validatePortableManifest(
  context: ValidationContext,
  options: PortableManifestOptions,
): Promise<PortableManifestResult | undefined> {
  const { pluginPath } = options;
  const manifestPath = portableManifestPath(pluginPath);
  const manifest = await readJsonObject(context, manifestPath);
  if (manifest === undefined) {
    return undefined;
  }

  // plugin.schema.json: additionalProperties is false, so any key outside the schema is an error.
  for (const key of Object.keys(manifest)) {
    if (!PORTABLE_MANIFEST_KEYS.has(key)) {
      error(
        context,
        "portable-manifest/key",
        manifestPath,
        `Unsupported portable manifest key "${key}"; Agent Plugins 1.0.0 closes the manifest schema. Client-specific data belongs under "extensions".`,
        `/${key}`,
      );
    }
  }

  // plugin.schema.json: $schema is required and its value is a const.
  if (manifest["$schema"] !== PORTABLE_MANIFEST_SCHEMA_URL) {
    error(
      context,
      "portable-manifest/schema",
      manifestPath,
      `Expected "$schema" to be "${PORTABLE_MANIFEST_SCHEMA_URL}".`,
      "/$schema",
    );
  }

  const { author, name } = validateCommonManifestFields(context, manifest, {
    catalogName: options.catalogName,
    manifestPath,
    pluginPath,
  });

  // plugin.schema.json: name minLength 1, maxLength 64, and the pattern in specs.ts.
  if (
    name !== undefined &&
    (name.length > PORTABLE_MANIFEST_NAME_MAX_LENGTH || !PORTABLE_MANIFEST_NAME_PATTERN.test(name))
  ) {
    error(
      context,
      "portable-manifest/name",
      manifestPath,
      `Plugin name "${name}" must be 1-64 characters of lowercase letters, digits, "-", or "."; start and end alphanumeric; and contain no "--" or "..".`,
      "/name",
    );
  }

  // plugin.schema.json: author permits only name, email, and url.
  if (author !== undefined) {
    for (const key of Object.keys(author)) {
      if (!PORTABLE_MANIFEST_AUTHOR_KEYS.has(key)) {
        error(
          context,
          "portable-manifest/author-key",
          manifestPath,
          `Unsupported author key "${key}"; Agent Plugins 1.0.0 permits name, email, and url.`,
          `/author/${key}`,
        );
      }
    }
  }

  // Repository decision: this marketplace ships to Codex and Claude Code only, so a namespace
  // other than com.openai is a typo until another client is targeted. The spec itself tells
  // clients to ignore namespaces they do not implement.
  const extensions = getOptionalObject(
    context,
    manifest,
    "extensions",
    manifestPath,
    "/extensions",
  );
  let extension: JsonObject | undefined;
  if (extensions !== undefined) {
    for (const namespace of Object.keys(extensions)) {
      if (namespace !== CODEX_EXTENSION_NAMESPACE) {
        error(
          context,
          "portable-manifest/extension-namespace",
          manifestPath,
          `Unsupported extension namespace "${namespace}"; this repository targets Codex through "${CODEX_EXTENSION_NAMESPACE}" and Claude Code through .claude-plugin/plugin.json.`,
          `/extensions/${namespace}`,
        );
      }
    }
    if (extensions[CODEX_EXTENSION_NAMESPACE] !== undefined) {
      extension = getObject(
        context,
        extensions,
        CODEX_EXTENSION_NAMESPACE,
        manifestPath,
        CODEX_EXTENSION_POINTER,
      );
    }
  }

  if (extension !== undefined) {
    await validateCodexExtension(context, extension, {
      category: options.category,
      manifestPath,
      pluginPath,
    });
  }

  return { codexExtension: extension, manifest };
}
