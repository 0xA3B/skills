import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { seedGitEnvironment } from "./seeds.js";
import {
  appendStagedSkillCanaries,
  createStagedWorkspace,
  listRepoLocalSkills,
  needsCaseWorkspace,
  pluginsToStage,
  stageCaseWorkspace,
  stagedSkillFilePath,
  stagePluginCopies,
  stageRepoLocalSkill,
  surveyStagedSkills,
} from "./staging.js";
import { resolveSkillTarget } from "./target.js";
import { writeRepoFixture, writeRepoLocalSkillFixture, writeSeedFixture } from "./test-utils.js";
import type { PluginSkillTarget } from "./types.js";

const execFileAsync = promisify(execFile);

async function pluginTarget(repoRoot: string): Promise<PluginSkillTarget> {
  const target = resolveSkillTarget(repoRoot, "plugins/demo/skills/auto-skill");
  if (target.kind !== "plugin") {
    throw new Error("expected a plugin target");
  }
  return target;
}

describe("surveyStagedSkills", () => {
  it("canaries every implicitly invokable staged skill and labels all of them", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "sibling-skill" }, { name: "manual-skill", manualOnly: true }],
    });
    const target = await pluginTarget(repoRoot);

    const survey = await surveyStagedSkills(target, pluginsToStage(target, []));

    expect(survey.stagedSkillLabels.sort()).toStrictEqual([
      "demo:auto-skill",
      "demo:manual-skill",
      "demo:sibling-skill",
    ]);
    expect(survey.skillCanaries.map((skillCanary) => skillCanary.skillLabel).sort()).toStrictEqual([
      "demo:auto-skill",
      "demo:sibling-skill",
    ]);
  });

  it("gives repo-local targets no canary exception: staged plugin skills follow their policy", async () => {
    const pluginRepoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkillTarget(repoRoot, ".agents/skills/auto-skill");

    // A repo-local target owns no plugin, so exactly the extra entries stage.
    const entries = pluginsToStage(target, [
      { pluginName: "demo", pluginPath: path.join(pluginRepoRoot, "plugins", "demo") },
    ]);
    const survey = await surveyStagedSkills(target, entries);

    expect(entries.map((entry) => entry.pluginName)).toStrictEqual(["demo"]);
    expect(survey.stagedSkillLabels.sort()).toStrictEqual(["demo:auto-skill", "demo:manual-skill"]);
    expect(survey.skillCanaries.map((skillCanary) => skillCanary.skillLabel)).toStrictEqual([
      "demo:auto-skill",
    ]);
  });
});

describe("listRepoLocalSkills", () => {
  it("returns an empty list when the repo has no repo-local skills directory", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "staging-test-"));

    await expect(listRepoLocalSkills(repoRoot)).resolves.toStrictEqual([]);
  });

  it("lists only SKILL.md-bearing directories, sorted by name", async () => {
    const repoRoot = await writeRepoLocalSkillFixture({
      siblingSkills: [{ name: "zeta-skill" }, { name: "alpha-skill" }],
    });
    await writeFile(path.join(repoRoot, ".agents", "skills", "stray-file"), "not a skill");
    await mkdir(path.join(repoRoot, ".agents", "skills", "empty-dir"));

    const skills = await listRepoLocalSkills(repoRoot);

    expect(skills.map((skill) => skill.skillName)).toStrictEqual([
      "alpha-skill",
      "auto-skill",
      "zeta-skill",
    ]);
  });
});

describe("stagePluginCopies", () => {
  it("copies plugins into the workspace and appended canaries stay out of manual-only skills", async () => {
    const repoRoot = await writeRepoFixture({
      siblingSkills: [{ name: "manual-skill", manualOnly: true }],
    });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();
    const entries = pluginsToStage(target, []);

    await stagePluginCopies(workspacePath, entries);
    const survey = await surveyStagedSkills(target, entries);
    await appendStagedSkillCanaries(workspacePath, survey.skillCanaries);

    const stagedTarget = await readFile(stagedSkillFilePath(workspacePath, target), "utf8");
    expect(stagedTarget).toContain("Trigger Eval Instructions");
    // Body-only injection: the frontmatter description under test stays untouched.
    expect(stagedTarget).not.toContain("Eval only:");
    const stagedManual = await readFile(
      path.join(workspacePath, "plugins", "demo", "skills", "manual-skill", "SKILL.md"),
      "utf8",
    );
    expect(stagedManual).not.toContain("Trigger Eval Instructions");
  });

  it("resolves plugin versions from the Claude manifest when no Codex manifest ships", async () => {
    const repoRoot = await writeRepoFixture({ claudeOnly: true });
    const target = await pluginTarget(repoRoot);
    const { workspacePath } = await createStagedWorkspace();

    const stagedPlugins = await stagePluginCopies(workspacePath, pluginsToStage(target, []));

    expect(stagedPlugins).toStrictEqual([
      { pluginName: "demo", sourcePath: target.pluginPath, version: "1.0.0" },
    ]);
  });
});

describe("needsCaseWorkspace", () => {
  it("copies the base workspace only for a workspace block or declared files", () => {
    const base = { id: "case", prompt: "Do it.", expect: "invoke" as const };
    expect(needsCaseWorkspace(base)).toBe(false);
    expect(needsCaseWorkspace({ ...base, workspaceFiles: {} })).toBe(false);
    expect(needsCaseWorkspace({ ...base, workspaceFiles: { "notes.md": "x" } })).toBe(true);
    expect(
      needsCaseWorkspace({
        ...base,
        workspace: { seed: "node-service", branch: "main", committed: {}, staged: {} },
      }),
    ).toBe(true);
  });
});

describe("stageCaseWorkspace", () => {
  it("seeds a git repository for a case with a workspace block", async () => {
    const { workspaceRoot, workspacePath } = await createStagedWorkspace();
    const repoRoot = await writeRepoLocalSkillFixture();
    await writeSeedFixture(repoRoot, "demo-seed");
    const target = resolveSkillTarget(repoRoot, ".agents/skills/auto-skill");
    await stageRepoLocalSkill(workspacePath, target, ".agents");

    const caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: workspacePath,
      workspaceRoot,
      repoRoot,
      testCase: {
        id: "seeded-case",
        prompt: "Anything",
        expect: "invoke",
        workspace: { seed: "demo-seed", branch: "main", committed: {}, staged: {} },
        workspaceFiles: { "notes.md": "unstaged\n" },
      },
    });

    expect(caseWorkspacePath).toContain(path.join("cases", "seeded-case", "workspace"));
    await expect(stat(path.join(caseWorkspacePath, ".git"))).resolves.toBeDefined();
    await expect(
      readFile(path.join(caseWorkspacePath, "src", "index.js"), "utf8"),
    ).resolves.toContain("seed");
    await expect(readFile(path.join(caseWorkspacePath, "notes.md"), "utf8")).resolves.toBe(
      "unstaged\n",
    );
    // The harness surfaces copied from the base workspace join the seed commit, so the only
    // dirty path the agent can see is the case's unstaged workspace file.
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: caseWorkspacePath,
      env: seedGitEnvironment(),
    });
    expect(stdout.trimEnd().split("\n")).toStrictEqual(["?? notes.md"]);
  });

  it("copies the base workspace and applies fixture workspace files", async () => {
    const { workspaceRoot, workspacePath } = await createStagedWorkspace();
    const repoRoot = await writeRepoLocalSkillFixture();
    const target = resolveSkillTarget(repoRoot, ".agents/skills/auto-skill");
    await stageRepoLocalSkill(workspacePath, target, ".agents");

    const caseWorkspacePath = await stageCaseWorkspace({
      baseWorkspacePath: workspacePath,
      workspaceRoot,
      repoRoot,
      testCase: {
        id: "agents-case",
        prompt: "Anything",
        expect: "skip",
        workspaceFiles: { "AGENTS.md": "Use Gitmoji.\n" },
      },
    });

    expect(caseWorkspacePath).toContain(path.join("cases", "agents-case", "workspace"));
    await expect(readFile(path.join(caseWorkspacePath, "AGENTS.md"), "utf8")).resolves.toBe(
      "Use Gitmoji.\n",
    );
    await expect(
      readFile(path.join(caseWorkspacePath, ".agents", "skills", "auto-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("auto-skill");
  });
});
