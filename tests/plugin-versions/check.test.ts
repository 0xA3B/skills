import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPluginVersions } from "../../src/plugin-versions/check.js";
import { commitFiles, git, setOriginMain, withTempRepo, writeFiles } from "../git-fixtures.js";
import { manifest, withFeatureBranch } from "./test-utils.js";

describe("checkPluginVersions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Policy: "Bump at least the patch version for every change to a plugin's shipped content".
  it("reports a plugin whose shipped content changed without a version bump", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });

      const result = await checkPluginVersions({ repoRoot });

      expect(result.violations).toStrictEqual([
        {
          plugin: "demo",
          baseVersion: "1.0.0",
          headVersion: "1.0.0",
          allowedVersions: ["1.0.1", "1.1.0", "2.0.0"],
          changedPaths: ["README.md"],
        },
      ]);
    });
  });

  it.each(["1.0.1", "1.1.0", "2.0.0"])("accepts a single increment to %s", async (version) => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "feat: change", {
        "plugins/demo/README.md": "# Demo!\n",
        "plugins/demo/plugin.json": manifest(version),
      });

      expect((await checkPluginVersions({ repoRoot })).violations).toStrictEqual([]);
    });
  });

  // Policy: "Apply at most one version bump per plugin per branch."
  it.each(["1.0.2", "1.1.1", "0.9.0"])(
    "rejects %s, which is not one increment",
    async (version) => {
      await withFeatureBranch(async (repoRoot) => {
        await commitFiles(repoRoot, "feat: change", {
          "plugins/demo/plugin.json": manifest(version),
        });

        const [violation] = (await checkPluginVersions({ repoRoot })).violations;

        expect(violation).toMatchObject({ plugin: "demo", headVersion: version });
      });
    },
  );

  // Shipped content (AGENTS.md terminology) excludes trigger fixtures under skills/<skill>/evals/.
  it("lists only shipped paths when fixtures change beside them", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "fix: hello", {
        "plugins/demo/skills/hello/SKILL.md": "Hello!\n",
        "plugins/demo/skills/hello/evals/triggers.yaml": "version: 1\ncases: []\n",
      });

      const [violation] = (await checkPluginVersions({ repoRoot })).violations;

      expect(violation?.changedPaths).toStrictEqual(["skills/hello/SKILL.md"]);
    });
  });

  // alpha sorts before demo, so skipping it must not end the walk over the changed plugins.
  it("skips a plugin added on the branch and still checks the others", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "feat: add plugin", {
        "plugins/alpha/plugin.json": manifest("0.1.0"),
        "plugins/alpha/README.md": "# Alpha\n",
        "plugins/demo/README.md": "# Demo!\n",
      });

      const result = await checkPluginVersions({ repoRoot });

      expect(result.violations.map((violation) => violation.plugin)).toStrictEqual(["demo"]);
    });
  });

  it("does not require a bump for a plugin removed on the branch", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await git(repoRoot, "rm", "--quiet", "-r", "plugins/demo");
      await commitFiles(repoRoot, "feat!: remove plugin", {});

      expect((await checkPluginVersions({ repoRoot })).violations).toStrictEqual([]);
    });
  });

  // With rename detection, a move would report only its destination path.
  it("counts a file moved out of a plugin against the plugin it left", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await writeFiles(repoRoot, { "plugins/other/plugin.json": manifest("0.1.0") });
      await mkdir(path.join(repoRoot, "plugins/other/skills"));
      await git(repoRoot, "mv", "plugins/demo/skills/hello", "plugins/other/skills/hello");
      await commitFiles(repoRoot, "refactor: move hello", {});

      const result = await checkPluginVersions({ repoRoot });

      expect(result.violations.map((violation) => violation.plugin)).toStrictEqual(["demo"]);
    });
  });

  it("counts a shipped file moved into a trigger fixture directory", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await git(
        repoRoot,
        "mv",
        "plugins/demo/skills/hello/SKILL.md",
        "plugins/demo/skills/hello/evals/SKILL.md",
      );
      await commitFiles(repoRoot, "test: park skill", {});

      const [violation] = (await checkPluginVersions({ repoRoot })).violations;

      expect(violation?.changedPaths).toStrictEqual(["skills/hello/SKILL.md"]);
    });
  });

  it("reports a base version that is not x.y.z with no allowed versions", async () => {
    await withTempRepo(async (repoRoot) => {
      const base = await commitFiles(repoRoot, "chore: seed", {
        "plugins/demo/plugin.json": manifest("1.0"),
      });
      await setOriginMain(repoRoot, base);
      await commitFiles(repoRoot, "docs: readme", { "plugins/demo/README.md": "# Demo\n" });

      const [violation] = (await checkPluginVersions({ repoRoot })).violations;

      expect(violation).toMatchObject({ baseVersion: "1.0", allowedVersions: [] });
    });
  });

  // Policy: "If the branch already bumps the plugin version relative to the merge base".
  it("judges the branch from the merge base, not the moved base tip", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "fix: branch", {
        "plugins/demo/README.md": "# Demo!\n",
        "plugins/demo/plugin.json": manifest("1.0.1"),
      });
      await git(repoRoot, "switch", "--quiet", "main");
      const advanced = await commitFiles(repoRoot, "feat: main", {
        "plugins/demo/skills/hello/SKILL.md": "Hi.\n",
        "plugins/demo/plugin.json": manifest("1.1.0"),
      });
      await setOriginMain(repoRoot, advanced);
      await git(repoRoot, "switch", "--quiet", "feature");

      expect((await checkPluginVersions({ repoRoot })).violations).toStrictEqual([]);
    });
  });

  it("does not count changes only the base made after the branch started", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: root", { "README.md": "# Repo\n" });
      await git(repoRoot, "switch", "--quiet", "main");
      const advanced = await commitFiles(repoRoot, "fix: main", {
        "plugins/demo/README.md": "# Demo!\n",
        "plugins/demo/plugin.json": manifest("1.0.1"),
      });
      await setOriginMain(repoRoot, advanced);
      await git(repoRoot, "switch", "--quiet", "feature");

      const result = await checkPluginVersions({ repoRoot });

      expect(result.checkedPlugins).toStrictEqual([]);
      expect(result.violations).toStrictEqual([]);
    });
  });

  it("does not count changes the branch merged in from the base", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await git(repoRoot, "switch", "--quiet", "main");
      const advanced = await commitFiles(repoRoot, "feat: main", {
        "plugins/demo/skills/hello/SKILL.md": "Hi.\n",
        "plugins/demo/plugin.json": manifest("1.1.0"),
      });
      await setOriginMain(repoRoot, advanced);
      await git(repoRoot, "switch", "--quiet", "feature");
      await git(repoRoot, "merge", "--quiet", "--no-ff", "--no-edit", "main");

      expect((await checkPluginVersions({ repoRoot })).violations).toStrictEqual([]);
    });
  });

  it("reads only committed state", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await writeFiles(repoRoot, { "plugins/demo/README.md": "# Uncommitted\n" });
      await git(repoRoot, "add", "plugins/demo/README.md");
      await writeFiles(repoRoot, { "plugins/demo/LICENSE": "MIT\n" });

      expect((await checkPluginVersions({ repoRoot })).violations).toStrictEqual([]);
    });
  });

  // diff.relative would print paths relative to the subdirectory.
  it("checks the whole repository when run from a subdirectory", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });
      await git(repoRoot, "config", "diff.relative", "true");

      const result = await checkPluginVersions({
        repoRoot: path.join(repoRoot, "plugins", "demo", "skills"),
      });

      expect(result.violations.map((violation) => violation.plugin)).toStrictEqual(["demo"]);
    });
  });

  it("compares against the given base ref", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });
      const reworded = await git(repoRoot, "rev-parse", "HEAD");
      await git(repoRoot, "update-ref", "refs/heads/release", reworded);
      await commitFiles(repoRoot, "chore: empty", {});

      const result = await checkPluginVersions({ repoRoot, base: "release" });

      expect(result.violations).toStrictEqual([]);
    });
  });

  it("refuses a missing base and names the override", async () => {
    await withTempRepo(async (repoRoot) => {
      await commitFiles(repoRoot, "chore: seed", { "plugins/demo/plugin.json": manifest("1.0.0") });

      await expect(checkPluginVersions({ repoRoot })).rejects.toThrow(
        'base ref "origin/main" does not exist; fetch it or pass --base <ref>.',
      );
    });
  });

  it("refuses a base that shares no history with HEAD", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await git(repoRoot, "switch", "--quiet", "--orphan", "unrelated");
      await commitFiles(repoRoot, "chore: unrelated", { "README.md": "other\n" });

      await expect(checkPluginVersions({ repoRoot })).rejects.toThrow(
        'HEAD shares no history with base ref "origin/main".',
      );
    });
  });

  // A shallow history can hide the merge base or cut the range short while every git command
  // succeeds.
  it("refuses a shallow clone", async () => {
    await withFeatureBranch(async (repoRoot) => {
      await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });
      const clone = await mkdtemp(path.join(tmpdir(), "plugin-versions-shallow-"));
      try {
        await git(clone, "clone", "--quiet", "--depth=1", `file://${repoRoot}`, "repo");
        const cloneRoot = path.join(clone, "repo");
        await setOriginMain(cloneRoot, await git(cloneRoot, "rev-parse", "HEAD"));

        await expect(checkPluginVersions({ repoRoot: cloneRoot })).rejects.toThrow(
          "the repository is a shallow clone; run git fetch --unshallow and retry.",
        );
      } finally {
        await rm(clone, { force: true, recursive: true });
      }
    });
  });

  // A hook exports GIT_DIR to the commands it runs.
  it("checks the repository at repoRoot even when GIT_DIR points elsewhere", async () => {
    await withTempRepo(async (otherRepo) => {
      await withFeatureBranch(async (repoRoot) => {
        await commitFiles(repoRoot, "docs: reword", { "plugins/demo/README.md": "# Demo!\n" });
        vi.stubEnv("GIT_DIR", path.join(otherRepo, ".git"));

        const result = await checkPluginVersions({ repoRoot });

        expect(result.violations.map((violation) => violation.plugin)).toStrictEqual(["demo"]);
      });
    });
  });
});
