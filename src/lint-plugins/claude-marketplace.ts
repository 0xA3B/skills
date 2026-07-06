import path from "node:path";

import { error, type ValidationContext } from "./diagnostics.js";
import { isDirectory, isFile, readJsonObject } from "./files.js";
import { resolveRelativePath } from "./paths.js";
import { getObject, getOptionalString, getString, isObject } from "./schema.js";
import {
  CLAUDE_MARKETPLACE_OWNER_KEYS,
  CLAUDE_MARKETPLACE_PLUGIN_KEYS,
  CLAUDE_MARKETPLACE_ROOT_KEYS,
} from "./specs.js";
import type { ClaudeCatalog, ClaudeCatalogEntry } from "./types.js";
import { validateUrlString } from "./urls.js";

export async function validateClaudeMarketplace(
  context: ValidationContext,
): Promise<ClaudeCatalog> {
  const marketplacePath = path.join(context.repoRoot, ".claude-plugin", "marketplace.json");
  const marketplaceRoot = path.resolve(path.dirname(marketplacePath), "..");
  const localEntries = new Map<string, ClaudeCatalogEntry>();

  if (!(await isFile(marketplacePath))) {
    return { localEntries, marketplacePath, present: false };
  }

  const marketplace = await readJsonObject(context, marketplacePath);
  if (marketplace === undefined) {
    return { localEntries, marketplacePath, present: true };
  }

  for (const key of Object.keys(marketplace)) {
    if (!CLAUDE_MARKETPLACE_ROOT_KEYS.has(key)) {
      error(
        context,
        "claude-marketplace/root-key",
        marketplacePath,
        `Unsupported Claude marketplace key "${key}" in this repository.`,
        `/${key}`,
      );
    }
  }

  getString(context, marketplace, "name", marketplacePath, "/name");
  getOptionalString(context, marketplace, "description", marketplacePath, "/description");

  const owner = getObject(context, marketplace, "owner", marketplacePath, "/owner");
  if (owner !== undefined) {
    for (const key of Object.keys(owner)) {
      if (!CLAUDE_MARKETPLACE_OWNER_KEYS.has(key)) {
        error(
          context,
          "claude-marketplace/owner-key",
          marketplacePath,
          `Unsupported Claude marketplace owner key "${key}".`,
          `/owner/${key}`,
        );
      }
    }
    getString(context, owner, "name", marketplacePath, "/owner/name");
    getOptionalString(context, owner, "email", marketplacePath, "/owner/email");
    const ownerUrl = getOptionalString(context, owner, "url", marketplacePath, "/owner/url");
    validateUrlString(context, ownerUrl, marketplacePath, "/owner/url", "url/http");
  }

  const plugins = marketplace["plugins"];
  if (!Array.isArray(plugins)) {
    error(
      context,
      "claude-marketplace/plugins",
      marketplacePath,
      'Expected "plugins" to be an array.',
      "/plugins",
    );
    return { localEntries, marketplacePath, present: true };
  }

  const seenNames = new Set<string>();
  for (const [index, plugin] of plugins.entries()) {
    const pointer = `/plugins/${index}`;

    if (!isObject(plugin)) {
      error(
        context,
        "schema/object",
        marketplacePath,
        `Expected plugins[${index}] to be an object.`,
        pointer,
      );
      continue;
    }

    for (const key of Object.keys(plugin)) {
      if (!CLAUDE_MARKETPLACE_PLUGIN_KEYS.has(key)) {
        error(
          context,
          "claude-marketplace/plugin-key",
          marketplacePath,
          `Unsupported Claude marketplace plugin key "${key}" in this repository.`,
          `${pointer}/${key}`,
        );
      }
    }

    const name = getString(context, plugin, "name", marketplacePath, `${pointer}/name`);
    getOptionalString(context, plugin, "description", marketplacePath, `${pointer}/description`);

    if (name !== undefined && seenNames.has(name)) {
      error(
        context,
        "claude-marketplace/duplicate-name",
        marketplacePath,
        `Duplicate Claude marketplace plugin name "${name}".`,
        `${pointer}/name`,
      );
    }

    if (name === undefined) {
      continue;
    }
    seenNames.add(name);

    const source = plugin["source"];
    if (typeof source !== "string" || source.length === 0) {
      error(
        context,
        "claude-marketplace/source",
        marketplacePath,
        'Expected "source" to be a "./"-prefixed local path. This repository hosts its Claude plugins in-tree.',
        `${pointer}/source`,
      );
      continue;
    }

    const pluginPath = resolveRelativePath(
      context,
      source,
      marketplaceRoot,
      marketplacePath,
      `${pointer}/source`,
      "claude-marketplace/source-path",
    );
    if (pluginPath === undefined) {
      continue;
    }

    if (!(await isDirectory(pluginPath))) {
      error(
        context,
        "claude-marketplace/source-exists",
        marketplacePath,
        `Plugin path does not exist or is not a directory: ${source}`,
        `${pointer}/source`,
      );
      continue;
    }

    const manifestPath = path.join(pluginPath, ".claude-plugin", "plugin.json");
    if (!(await isFile(manifestPath))) {
      error(
        context,
        "claude-marketplace/source-manifest",
        marketplacePath,
        `Plugin path is missing .claude-plugin/plugin.json: ${source}`,
        `${pointer}/source`,
      );
      continue;
    }

    localEntries.set(name, { manifestPath, name, pluginPath, pointer, sourcePath: source });
  }

  return { localEntries, marketplacePath, present: true };
}
