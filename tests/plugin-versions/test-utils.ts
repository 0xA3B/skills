import { commitFiles, git, setOriginMain, withTempRepo } from "../git-fixtures.js";

export function manifest(version: string): string {
  return `${JSON.stringify({ name: "demo", version }, null, 2)}\n`;
}

// main holds plugins/demo at 1.0.0; the returned repository is on a feature branch from it.
export async function withFeatureBranch<T>(callback: (repoRoot: string) => Promise<T>): Promise<T> {
  return withTempRepo(async (repoRoot) => {
    const base = await commitFiles(repoRoot, "chore: seed", {
      "plugins/demo/plugin.json": manifest("1.0.0"),
      "plugins/demo/README.md": "# Demo\n",
      "plugins/demo/skills/hello/SKILL.md": "Hello.\n",
      "plugins/demo/skills/hello/evals/triggers.yaml": "version: 1\n",
    });
    await setOriginMain(repoRoot, base);
    await git(repoRoot, "switch", "--quiet", "--create", "feature");
    return callback(repoRoot);
  });
}
