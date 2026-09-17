import { error, type ValidationContext } from "./diagnostics.js";
import { isFile } from "./files.js";
import type { ManifestLocation } from "./manifest-fields.js";
import { resolveRelativePath } from "./paths.js";
import {
  getOptionalObject,
  getOptionalString,
  getString,
  isObject,
  validateStringArray,
} from "./schema.js";
import { CODEX_EXTENSION_KEYS, CODEX_EXTENSION_NAMESPACE } from "./specs.js";
import type { JsonObject } from "./types.js";
import { validateUrlString } from "./urls.js";

// The Codex extension's dotted field name as it appears in messages, and its JSON pointer.
export const CODEX_EXTENSION_FIELD = `extensions.${CODEX_EXTENSION_NAMESPACE}`;
export const CODEX_EXTENSION_POINTER = `/extensions/${CODEX_EXTENSION_NAMESPACE}`;

// A plugin-relative file path the Codex extension names.
type CodexPathRule = {
  fieldName: string;
  pointer: string;
  value: unknown;
};

// The Codex extension: the extensions.com.openai payload of the portable manifest. Codex reads
// interface (presentation), apps (registered MCP server mappings), and hooks from it and treats it
// as the whole Codex overlay. Source: https://developers.openai.com/codex/plugins/build.
export async function validateCodexExtension(
  context: ValidationContext,
  extension: JsonObject,
  location: { category: string | undefined; manifestPath: string; pluginPath: string },
): Promise<void> {
  for (const key of Object.keys(extension)) {
    if (!CODEX_EXTENSION_KEYS.has(key)) {
      error(
        context,
        "codex-extension/key",
        location.manifestPath,
        `Unsupported Codex extension key "${key}"; Codex reads apps, hooks, and interface from ${CODEX_EXTENSION_FIELD}.`,
        `${CODEX_EXTENSION_POINTER}/${key}`,
      );
    }
  }

  const manifestInterface = getOptionalObject(
    context,
    extension,
    "interface",
    location.manifestPath,
    `${CODEX_EXTENSION_POINTER}/interface`,
  );
  if (manifestInterface !== undefined) {
    validatePluginInterface(context, manifestInterface, location, CODEX_EXTENSION_POINTER);
  }

  await validateComponentPaths(context, extension, location, CODEX_EXTENSION_POINTER);
}

// Codex plugin interface metadata. Source: https://developers.openai.com/codex/plugins/build,
// the extensions.com.openai.interface example, and the plugin-creator reference in
// https://github.com/openai/codex (codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md).
function validatePluginInterface(
  context: ValidationContext,
  manifestInterface: JsonObject,
  location: ManifestLocation & { category: string | undefined },
  pointerBase: string,
): void {
  const { manifestPath } = location;
  const pointer = `${pointerBase}/interface`;
  for (const fieldName of ["displayName", "shortDescription", "longDescription", "developerName"]) {
    getString(context, manifestInterface, fieldName, manifestPath, `${pointer}/${fieldName}`);
  }
  const interfaceCategory = getString(
    context,
    manifestInterface,
    "category",
    manifestPath,
    `${pointer}/category`,
  );

  if (
    location.category !== undefined &&
    interfaceCategory !== undefined &&
    location.category !== interfaceCategory
  ) {
    error(
      context,
      "alignment/category",
      manifestPath,
      `Plugin interface category "${interfaceCategory}" does not match marketplace category "${location.category}".`,
      `${pointer}/category`,
    );
  }

  validateStringArray(
    context,
    manifestInterface["capabilities"],
    "interface.capabilities",
    manifestPath,
    `${pointer}/capabilities`,
    { required: true },
  );
  const defaultPrompts = validateStringArray(
    context,
    manifestInterface["defaultPrompt"],
    "interface.defaultPrompt",
    manifestPath,
    `${pointer}/defaultPrompt`,
    { required: false },
  );
  if (defaultPrompts !== undefined && defaultPrompts.length > 3) {
    error(
      context,
      "manifest/default-prompt-limit",
      manifestPath,
      "Expected interface.defaultPrompt to contain 3 or fewer prompts because Codex UI surfaces only the first 3.",
      `${pointer}/defaultPrompt`,
    );
  }

  for (const fieldName of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const url = getOptionalString(
      context,
      manifestInterface,
      fieldName,
      manifestPath,
      `${pointer}/${fieldName}`,
    );
    validateUrlString(context, url, manifestPath, `${pointer}/${fieldName}`, "url/http");
  }

  const brandColor = getOptionalString(
    context,
    manifestInterface,
    "brandColor",
    manifestPath,
    `${pointer}/brandColor`,
  );
  if (brandColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    error(
      context,
      "manifest/brand-color",
      manifestPath,
      "Expected interface.brandColor to be a 6-digit hex color.",
      `${pointer}/brandColor`,
    );
  }
}

// Plugin-relative paths the Codex extension may name: apps, hooks, and interface assets. Every
// path resolves from the plugin root.
async function validateComponentPaths(
  context: ValidationContext,
  extension: JsonObject,
  location: ManifestLocation,
  pointerBase: string,
): Promise<void> {
  const pathRules: CodexPathRule[] = [
    {
      fieldName: "apps",
      pointer: `${pointerBase}/apps`,
      value: extension["apps"],
    },
  ];

  const manifestInterface = isObject(extension["interface"]) ? extension["interface"] : undefined;
  if (manifestInterface !== undefined) {
    const interfacePointer = `${pointerBase}/interface`;
    pathRules.push(
      {
        fieldName: "interface.composerIcon",
        pointer: `${interfacePointer}/composerIcon`,
        value: manifestInterface["composerIcon"],
      },
      {
        fieldName: "interface.logo",
        pointer: `${interfacePointer}/logo`,
        value: manifestInterface["logo"],
      },
    );

    if (manifestInterface["screenshots"] !== undefined) {
      const screenshots = validateStringArray(
        context,
        manifestInterface["screenshots"],
        "interface.screenshots",
        location.manifestPath,
        `${interfacePointer}/screenshots`,
        { required: true },
      );
      if (screenshots !== undefined) {
        for (const [index, screenshot] of screenshots.entries()) {
          pathRules.push({
            fieldName: `interface.screenshots[${index}]`,
            pointer: `${interfacePointer}/screenshots/${index}`,
            value: screenshot,
          });
        }
      }
    }
  }

  await validateManifestPathRules(context, pathRules, location);
  await validateHooksPath(context, extension["hooks"], location, `${pointerBase}/hooks`);
}

async function validateManifestPathRules(
  context: ValidationContext,
  pathRules: CodexPathRule[],
  location: ManifestLocation,
): Promise<void> {
  for (const rule of pathRules) {
    if (rule.value === undefined) {
      continue;
    }

    if (typeof rule.value !== "string" || rule.value.length === 0) {
      error(
        context,
        "manifest/path-type",
        location.manifestPath,
        `Expected "${rule.fieldName}" to be a non-empty string path.`,
        rule.pointer,
      );
      continue;
    }

    const resolved = resolveRelativePath(
      context,
      rule.value,
      location.pluginPath,
      location.manifestPath,
      rule.pointer,
      "manifest/path",
    );
    if (resolved === undefined) {
      continue;
    }

    if (!(await isFile(resolved))) {
      error(
        context,
        "manifest/path-exists",
        location.manifestPath,
        `Expected "${rule.fieldName}" to point to an existing file: ${rule.value}`,
        rule.pointer,
      );
    }
  }
}

async function validateHooksPath(
  context: ValidationContext,
  value: unknown,
  location: ManifestLocation,
  pointer: string,
): Promise<void> {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    await validateManifestPathRules(context, [{ fieldName: "hooks", pointer, value }], location);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (typeof item === "string") {
        await validateManifestPathRules(
          context,
          [
            {
              fieldName: `hooks[${index}]`,
              pointer: `${pointer}/${index}`,
              value: item,
            },
          ],
          location,
        );
      } else if (!isObject(item)) {
        error(
          context,
          "manifest/hooks",
          location.manifestPath,
          "Expected hooks array items to be file paths or inline lifecycle objects.",
          `${pointer}/${index}`,
        );
      }
    }
    return;
  }

  if (!isObject(value)) {
    error(
      context,
      "manifest/hooks",
      location.manifestPath,
      "Expected hooks to be a file path, inline lifecycle object, or array of those values.",
      pointer,
    );
  }
}
