import { describe, expect, it } from "vitest";

import { runPluginVersionCheck } from "../../src/plugin-versions/runner.js";
import { commitFiles, git, setOriginMain, withTempRepo } from "../git-fixtures.js";
import { manifest, withFeatureBranch } from "./test-utils.js";

async function run(repoRoot: string, args: string[] = []) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runPluginVersionCheck(args, {
    cwd: repoRoot,
    log: (line) => stdout.push(line),
    error: (line) => stderr.push(line),
  });
  return { exitCode, stdout, stderr };
}

describe("lint:plugin-versions", () => {
  it("fails and names the allowed versions and changed paths", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", {
        "plugins/demo/README.md": "# Demo!\n",
        "plugins/demo/LICENSE": "MIT\n",
        "plugins/demo/skills/hello/SKILL.md": "Hi.\n",
        "plugins/demo/skills/hello/references/a.md": "a\n",
        "plugins/demo/skills/hello/references/b.md": "b\n",
      });
      const mergeBase = await git(repoRoot, "rev-parse", "--short", "origin/main");

      const { exitCode, stdout, stderr } = await run(repoRoot);

      expect(exitCode).toBe(1);
      expect(stdout).toStrictEqual([]);
      expect(stderr).toStrictEqual([
        `Plugin version check failed for 1 plugin(s) since the merge base with origin/main (${mergeBase}):`,
        "- demo: shipped content changed (LICENSE, README.md, skills/hello/SKILL.md, and 2 more), so version 1.0.0 must become 1.0.1, 1.1.0, or 2.0.0; found 1.0.0.",
        "Bump each plugin once per branch, sized by the plugin version policy in plugins/AGENTS.md, in plugin.json and any .claude-plugin/plugin.json.",
      ]);
    });
  });

  it("explains a base version with no single increment", async () => {
    await withTempRepo(async (repoRoot) => {
      const base = await commitFiles(repoRoot, "chore: seed", {
        "plugins/demo/plugin.json": manifest("1.0"),
      });
      await setOriginMain(repoRoot, base);
      await commitFiles(repoRoot, "docs: readme", { "plugins/demo/README.md": "# Demo\n" });

      const { stderr } = await run(repoRoot);

      expect(stderr).toContain(
        "- demo: shipped content changed (README.md), but base version 1.0 is not x.y.z, so no single increment exists; found 1.0.",
      );
    });
  });

  it("passes and counts the plugins it checked", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "fix: readme", {
        "plugins/demo/README.md": "# Demo!\n",
        "plugins/demo/plugin.json": manifest("1.0.1"),
      });

      const { exitCode, stdout, stderr } = await run(repoRoot);

      expect(exitCode).toBe(0);
      expect(stderr).toStrictEqual([]);
      expect(stdout).toStrictEqual([
        "Plugin versions: 1 plugin(s) with shipped changes since the merge base with origin/main, each one increment ahead.",
      ]);
    });
  });

  it("passes when no shipped content changed", async () => {
    await withFeatureBranch(async (repoRoot) => {
      const { exitCode, stdout } = await run(repoRoot);

      expect(exitCode).toBe(0);
      expect(stdout).toStrictEqual([
        "Plugin versions: no shipped plugin content changed since the merge base with origin/main.",
      ]);
    });
  });

  it("compares against --base", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });

      const { exitCode, stdout } = await run(repoRoot, ["--base", "HEAD"]);

      expect(exitCode).toBe(0);
      expect(stdout).toStrictEqual([
        "Plugin versions: no shipped plugin content changed since the merge base with HEAD.",
      ]);
    });
  });

  it("fails with the reason when the check cannot run", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", {});

      const { exitCode, stderr } = await run(repoRoot);

      expect(exitCode).toBe(1);
      expect(stderr).toStrictEqual([
        'Plugin version check could not run: base ref "origin/main" does not exist; fetch it or pass --base <ref>.',
      ]);
    });
  });

  it("rejects unknown options", async () => {
    await withFeatureBranch(async (repoRoot) => {
      const { exitCode, stderr } = await run(repoRoot, ["--bsae", "main"]);

      expect(exitCode).toBe(1);
      expect(stderr).toStrictEqual(["Unknown option: --bsae"]);
    });
  });
});
