import { readFile } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "./json.js";
import type { TriggerEvalAgent } from "./types.js";

export type MarketplacePluginEntry = {
  pluginName: string;
  pluginPath: string;
};

// Each agent installs from its own catalog, so marketplace-wide staging and enumeration must read
// the catalog for the lane under evaluation: the two catalogs list different plugin sets (for
// example claude-in-codex ships only on Codex) and use different source shapes.
export async function listMarketplacePlugins(
  repoRoot: string,
  agent: TriggerEvalAgent,
): Promise<MarketplacePluginEntry[]> {
  const catalogPath =
    agent === "claude"
      ? path.join(repoRoot, ".claude-plugin", "marketplace.json")
      : path.join(repoRoot, ".agents", "plugins", "marketplace.json");

  let content: string;
  try {
    content = await readFile(catalogPath, "utf8");
  } catch (caught) {
    throw new Error(`Unable to read the ${agent} marketplace catalog at ${catalogPath}.`, {
      cause: caught,
    });
  }

  const catalog = JSON.parse(content) as unknown;
  if (!isRecord(catalog) || !Array.isArray(catalog["plugins"])) {
    throw new Error(`${catalogPath}: expected a marketplace catalog with a plugins array.`);
  }

  return catalog["plugins"].map((entry, index) => {
    if (!isRecord(entry) || typeof entry["name"] !== "string" || entry["name"].length === 0) {
      throw new Error(`${catalogPath}: plugins[${index}] is missing a plugin name.`);
    }

    const sourcePath = readEntrySourcePath(entry["source"]);
    if (sourcePath === undefined) {
      throw new Error(`${catalogPath}: plugins[${index}] is missing a local source path.`);
    }

    return {
      pluginName: entry["name"],
      pluginPath: path.resolve(repoRoot, sourcePath),
    };
  });
}

// The Claude catalog uses a plain relative-path source; the Codex catalog wraps the path in a
// { source: "local", path } object.
function readEntrySourcePath(source: unknown): string | undefined {
  if (typeof source === "string" && source.length > 0) {
    return source;
  }
  if (isRecord(source) && typeof source["path"] === "string" && source["path"].length > 0) {
    return source["path"];
  }

  return undefined;
}
