import { claudeExtensionPath } from "./claude-extension.js";
import { isFile } from "./files.js";
import { codexExtension, readCodexExtension } from "./portable-manifest.js";
import type { JsonObject, PluginTargets } from "./types.js";

// Which agents a plugin ships to, read from the extensions it carries: the Codex extension inside
// the portable manifest and the Claude extension file. Pass the parsed portable manifest when the
// caller already holds it; otherwise the manifest is read quietly. Catalog listing is a separate
// question, checked by coverage.ts.
export async function readPluginTargets(
  pluginPath: string,
  portableManifest?: JsonObject,
): Promise<PluginTargets> {
  const extension =
    portableManifest === undefined
      ? await readCodexExtension(pluginPath)
      : codexExtension(portableManifest);
  return {
    claude: await isFile(claudeExtensionPath(pluginPath)),
    codex: extension !== undefined,
  };
}
