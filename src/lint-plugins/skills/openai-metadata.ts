import path from "node:path";

import { error, type ValidationContext } from "../diagnostics.js";
import { isFile, readYamlObject } from "../files.js";
import { resolveRelativePath } from "../paths.js";
import { getBoolean, getObject, getOptionalString, getString, isObject } from "../schema.js";
import {
  OPENAI_METADATA_INTERFACE_KEYS,
  OPENAI_METADATA_POLICY_KEYS,
  OPENAI_METADATA_ROOT_KEYS,
} from "../specs.js";
import type { JsonObject } from "../types.js";
import { validateUrlString } from "../urls.js";

export async function validateOpenAiMetadata(
  context: ValidationContext,
  skillName: string,
  metadataPath: string,
): Promise<void> {
  const metadata = await readYamlObject(context, metadataPath);

  if (metadata === undefined) {
    return;
  }

  for (const key of Object.keys(metadata)) {
    if (!OPENAI_METADATA_ROOT_KEYS.has(key)) {
      error(
        context,
        "openai-metadata/root-key",
        metadataPath,
        `Unsupported OpenAI skill metadata key "${key}".`,
        `/${key}`,
      );
    }
  }

  if (metadata["version"] !== 1) {
    error(
      context,
      "repo/openai-metadata-version",
      metadataPath,
      'Expected "version" to be 1. This Codex plugin repository requires versioned OpenAI skill metadata.',
      "/version",
    );
  }

  const skillPath = path.dirname(path.dirname(metadataPath));
  const metadataInterface = getObject(context, metadata, "interface", metadataPath, "/interface");
  if (metadataInterface !== undefined) {
    validateOpenAiMetadataObjectKeys(
      context,
      metadataInterface,
      OPENAI_METADATA_INTERFACE_KEYS,
      metadataPath,
      "/interface",
      "interface",
    );
    getString(context, metadataInterface, "display_name", metadataPath, "/interface/display_name");
    getString(
      context,
      metadataInterface,
      "short_description",
      metadataPath,
      "/interface/short_description",
    );
    const defaultPrompt = metadataInterface["default_prompt"];
    if (typeof defaultPrompt !== "string" || defaultPrompt.length === 0) {
      error(
        context,
        "openai-metadata/default-prompt",
        metadataPath,
        'Expected "interface.default_prompt" to be a non-empty string.',
        "/interface/default_prompt",
      );
    }

    validateOpenAiBrandColor(context, metadataInterface["brand_color"], metadataPath);
    await validateOpenAiIconPath(
      context,
      metadataInterface["icon_small"],
      skillPath,
      metadataPath,
      "/interface/icon_small",
    );
    await validateOpenAiIconPath(
      context,
      metadataInterface["icon_large"],
      skillPath,
      metadataPath,
      "/interface/icon_large",
    );
  }

  const policy = getObject(context, metadata, "policy", metadataPath, "/policy");
  if (policy !== undefined) {
    validateOpenAiMetadataObjectKeys(
      context,
      policy,
      OPENAI_METADATA_POLICY_KEYS,
      metadataPath,
      "/policy",
      "policy",
    );
    getBoolean(
      context,
      policy,
      "allow_implicit_invocation",
      metadataPath,
      "/policy/allow_implicit_invocation",
    );
  }

  await validateOpenAiDependencies(context, metadata["dependencies"], metadataPath);

  const frontmatterName = path.basename(path.dirname(path.dirname(metadataPath)));
  if (frontmatterName !== skillName) {
    error(
      context,
      "openai-metadata/path",
      metadataPath,
      `Metadata path does not match skill directory "${skillName}".`,
    );
  }
}

export function validateOpenAiMetadataObjectKeys(
  context: ValidationContext,
  value: JsonObject,
  allowedKeys: Set<string>,
  filePath: string,
  pointer: string,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      error(
        context,
        "openai-metadata/key",
        filePath,
        `Unsupported OpenAI skill metadata ${label} key "${key}".`,
        `${pointer}/${key}`,
      );
    }
  }
}

export function validateOpenAiBrandColor(
  context: ValidationContext,
  value: unknown,
  metadataPath: string,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    error(
      context,
      "openai-metadata/brand-color",
      metadataPath,
      'Expected "interface.brand_color" to be a 6-digit hex color.',
      "/interface/brand_color",
    );
  }
}

export async function validateOpenAiIconPath(
  context: ValidationContext,
  value: unknown,
  skillPath: string,
  metadataPath: string,
  pointer: string,
): Promise<void> {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || value.length === 0) {
    error(
      context,
      "openai-metadata/icon-path",
      metadataPath,
      "Expected icon path to be a non-empty string.",
      pointer,
    );
    return;
  }

  const resolved = resolveRelativePath(
    context,
    value,
    skillPath,
    metadataPath,
    pointer,
    "openai-metadata/icon-path",
  );
  if (resolved !== undefined && !(await isFile(resolved))) {
    error(
      context,
      "openai-metadata/icon-path",
      metadataPath,
      `Expected icon path to point to an existing file: ${value}`,
      pointer,
    );
  }
}

export async function validateOpenAiDependencies(
  context: ValidationContext,
  value: unknown,
  metadataPath: string,
): Promise<void> {
  if (value === undefined) {
    return;
  }

  if (!isObject(value)) {
    error(
      context,
      "openai-metadata/dependencies",
      metadataPath,
      'Expected "dependencies" to be an object when provided.',
      "/dependencies",
    );
    return;
  }

  const tools = value["tools"];
  if (tools === undefined) {
    return;
  }

  if (!Array.isArray(tools)) {
    error(
      context,
      "openai-metadata/dependencies-tools",
      metadataPath,
      'Expected "dependencies.tools" to be an array when provided.',
      "/dependencies/tools",
    );
    return;
  }

  for (const [index, tool] of tools.entries()) {
    const pointer = `/dependencies/tools/${index}`;
    if (!isObject(tool)) {
      error(
        context,
        "openai-metadata/dependencies-tools",
        metadataPath,
        "Expected dependency tool entries to be objects.",
        pointer,
      );
      continue;
    }

    const type = getString(context, tool, "type", metadataPath, `${pointer}/type`);
    if (type !== undefined && type !== "mcp") {
      error(
        context,
        "openai-metadata/dependency-tool-type",
        metadataPath,
        'Expected dependency tool type to be "mcp".',
        `${pointer}/type`,
      );
    }

    getString(context, tool, "value", metadataPath, `${pointer}/value`);
    getOptionalString(context, tool, "description", metadataPath, `${pointer}/description`);
    getOptionalString(context, tool, "transport", metadataPath, `${pointer}/transport`);
    const url = getOptionalString(context, tool, "url", metadataPath, `${pointer}/url`);
    validateUrlString(context, url, metadataPath, `${pointer}/url`, "openai-metadata/url");
  }
}
