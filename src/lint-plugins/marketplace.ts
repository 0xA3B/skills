import path from "node:path";

import { error, type ValidationContext } from "./diagnostics.js";
import { readJsonObject } from "./files.js";
import { marketplaceRootFromPath, resolveRelativePath } from "./paths.js";
import { getObject, getString, isObject } from "./schema.js";
import type { Catalog, JsonObject, LocalCatalogEntry } from "./types.js";

export async function validateMarketplace(context: ValidationContext): Promise<Catalog> {
  const marketplacePath = path.join(context.repoRoot, ".agents", "plugins", "marketplace.json");
  const marketplaceRoot = marketplaceRootFromPath(marketplacePath);
  const marketplace = await readJsonObject(context, marketplacePath);
  const localEntries: LocalCatalogEntry[] = [];
  const seenNames = new Set<string>();

  if (marketplace === undefined) {
    return { localEntries, marketplacePath };
  }

  getString(context, marketplace, "name", marketplacePath, "/name");
  const marketplaceInterface = getObject(
    context,
    marketplace,
    "interface",
    marketplacePath,
    "/interface",
  );
  if (marketplaceInterface !== undefined) {
    getString(
      context,
      marketplaceInterface,
      "displayName",
      marketplacePath,
      "/interface/displayName",
    );
  }

  const plugins = marketplace["plugins"];
  if (!Array.isArray(plugins)) {
    error(
      context,
      "marketplace/plugins",
      marketplacePath,
      'Expected "plugins" to be an array.',
      "/plugins",
    );
    return { localEntries, marketplacePath };
  }

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

    const name = getString(context, plugin, "name", marketplacePath, `${pointer}/name`);
    const category = getString(context, plugin, "category", marketplacePath, `${pointer}/category`);
    const policy = getObject(context, plugin, "policy", marketplacePath, `${pointer}/policy`);

    if (policy !== undefined) {
      validatePolicy(context, policy, marketplacePath, `${pointer}/policy`);
    }

    if (name !== undefined && seenNames.has(name)) {
      error(
        context,
        "marketplace/duplicate-name",
        marketplacePath,
        `Duplicate marketplace plugin name "${name}".`,
        `${pointer}/name`,
      );
    }

    if (name === undefined) {
      continue;
    }
    seenNames.add(name);

    const source = plugin["source"];
    if (typeof source === "string") {
      const pluginPath = validateLocalMarketplacePath(
        context,
        name,
        source,
        category,
        marketplacePath,
        marketplaceRoot,
        `${pointer}/source`,
      );
      if (pluginPath !== undefined) {
        localEntries.push(pluginPath);
      }
      continue;
    }

    if (!isObject(source)) {
      error(
        context,
        "schema/object",
        marketplacePath,
        'Expected "source" to be an object or local path string.',
        `${pointer}/source`,
      );
      continue;
    }

    const sourceType = getString(
      context,
      source,
      "source",
      marketplacePath,
      `${pointer}/source/source`,
    );
    if (sourceType === "local") {
      const sourcePath = getString(
        context,
        source,
        "path",
        marketplacePath,
        `${pointer}/source/path`,
      );
      if (sourcePath === undefined) {
        continue;
      }

      const pluginPath = validateLocalMarketplacePath(
        context,
        name,
        sourcePath,
        category,
        marketplacePath,
        marketplaceRoot,
        `${pointer}/source/path`,
      );
      if (pluginPath !== undefined) {
        localEntries.push(pluginPath);
      }
    } else if (sourceType !== undefined) {
      error(
        context,
        "marketplace/source-type",
        marketplacePath,
        'Only local plugin sources are supported; expected source.source to be "local".',
        `${pointer}/source/source`,
      );
    }
  }

  return { localEntries, marketplacePath };
}

export function validatePolicy(
  context: ValidationContext,
  policy: JsonObject,
  filePath: string,
  pointer: string,
): void {
  const installation = getString(
    context,
    policy,
    "installation",
    filePath,
    `${pointer}/installation`,
  );
  const authentication = getString(
    context,
    policy,
    "authentication",
    filePath,
    `${pointer}/authentication`,
  );

  if (
    installation !== undefined &&
    !["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(installation)
  ) {
    error(
      context,
      "marketplace/policy-installation",
      filePath,
      'Expected policy.installation to be "AVAILABLE", "INSTALLED_BY_DEFAULT", or "NOT_AVAILABLE".',
      `${pointer}/installation`,
    );
  }

  if (authentication !== undefined && !["ON_INSTALL", "ON_FIRST_USE"].includes(authentication)) {
    error(
      context,
      "marketplace/policy-authentication",
      filePath,
      'Expected policy.authentication to be "ON_INSTALL" or "ON_FIRST_USE".',
      `${pointer}/authentication`,
    );
  }
}

function validateLocalMarketplacePath(
  context: ValidationContext,
  name: string,
  sourcePath: string,
  category: string | undefined,
  marketplacePath: string,
  marketplaceRoot: string,
  pointer: string,
): LocalCatalogEntry | undefined {
  const pluginPath = resolveRelativePath(
    context,
    sourcePath,
    marketplaceRoot,
    marketplacePath,
    pointer,
    "marketplace/source-path",
  );

  if (pluginPath === undefined) {
    return undefined;
  }

  return { category, name, pluginPath, pointer, sourcePath };
}
