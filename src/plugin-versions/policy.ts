// The plugin version policy's rules (plugins/AGENTS.md), free of git so they can be tested on
// plain values. check.ts gathers the inputs from git history.

// Groups changed repository paths by plugin, keeping only shipped content: every file under
// plugins/<plugin>/ except trigger fixtures under skills/<skill>/evals/. Files directly under
// plugins/ belong to no plugin. Returned paths are relative to the plugin directory.
export function shippedChangesByPlugin(changedPaths: readonly string[]): Map<string, string[]> {
  const byPlugin = new Map<string, string[]>();
  for (const changedPath of changedPaths) {
    const [root, plugin, ...rest] = changedPath.split("/");
    if (root !== "plugins" || plugin === undefined || rest.length === 0) {
      continue;
    }
    if (rest[0] === "skills" && rest[2] === "evals") {
      continue;
    }
    byPlugin.set(plugin, [...(byPlugin.get(plugin) ?? []), rest.join("/")]);
  }
  return byPlugin;
}

// The next patch, minor, and major versions of an x.y.z version, the only versions one bump per
// plugin per branch can reach; empty when the version is not x.y.z.
export function nextVersions(version: string): string[] {
  const groups = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/.exec(
    version,
  )?.groups;
  if (groups === undefined) {
    return [];
  }
  // BigInt keeps the increment exact for components beyond Number.MAX_SAFE_INTEGER, where adding 1
  // to a number can round back to the same value and pass an unbumped plugin.
  const major = BigInt(groups["major"] ?? "");
  const minor = BigInt(groups["minor"] ?? "");
  const patch = BigInt(groups["patch"] ?? "");
  return [`${major}.${minor}.${patch + 1n}`, `${major}.${minor + 1n}.0`, `${major + 1n}.0.0`];
}
