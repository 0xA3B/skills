import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  dependentRunOptions,
  findDependentFixtures,
  listSelectedSkillPaths,
  selectDependentsForAgent,
} from "../../../src/trigger-evals/selection/dependents.js";
import {
  type FixtureCase,
  triggerFixtureYaml,
  writeMarketplaceCatalogs,
  writeSkillFiles,
} from "../test-utils.js";

describe("listSelectedSkillPaths", () => {
  it("expands a plugin selection to every skill directory in the plugin", async () => {
    const repoRoot = await writeDependentsFixture();

    await expect(
      listSelectedSkillPaths(repoRoot, { mode: "plugin", pluginPath: "plugins/demo" }),
    ).resolves.toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "demo", "skills", "target-skill"),
    ]);
  });

  it("expands an unfiltered marketplace selection to every catalog skill on both agents", async () => {
    const repoRoot = await writeDependentsFixture();

    await expect(
      listSelectedSkillPaths(repoRoot, { mode: "marketplace", skillPaths: [] }),
    ).resolves.toStrictEqual([
      path.join("plugins", "demo", "skills", "auto-skill"),
      path.join("plugins", "demo", "skills", "target-skill"),
      path.join("plugins", "other", "skills", "other-skill"),
    ]);
  });

  it("keeps explicit skill and marketplace paths as given", async () => {
    const repoRoot = await writeDependentsFixture();

    await expect(
      listSelectedSkillPaths(repoRoot, {
        mode: "skill",
        skillPath: "plugins/demo/skills/target-skill",
      }),
    ).resolves.toStrictEqual([path.join("plugins", "demo", "skills", "target-skill")]);
    await expect(
      listSelectedSkillPaths(repoRoot, {
        mode: "marketplace",
        skillPaths: ["plugins/other/skills/other-skill"],
      }),
    ).resolves.toStrictEqual([path.join("plugins", "other", "skills", "other-skill")]);
  });
});

describe("findDependentFixtures", () => {
  // Spec: "scan every plugin and repo-local fixture for cases whose invoke-instead names a
  // selected skill".
  it("finds plugin cases in other fixtures that route to a selected plugin skill", async () => {
    const repoRoot = await writeDependentsFixture();

    const scan = await findDependentFixtures(repoRoot, ["plugins/demo/skills/target-skill"]);

    expect(scan.unreadableFixtures).toStrictEqual([]);
    expect(scan.dependents).toStrictEqual([
      {
        skillPath: path.join("plugins", "demo", "skills", "auto-skill"),
        label: "demo:auto-skill",
        caseIds: ["route-to-target"],
        routesTo: ["demo:target-skill"],
      },
      {
        skillPath: path.join("plugins", "other", "skills", "other-skill"),
        label: "other:other-skill",
        caseIds: ["first-route", "second-route"],
        routesTo: ["demo:target-skill"],
      },
    ]);
  });

  it("excludes fixtures owned by the selected skills because the suite already ran them", async () => {
    const repoRoot = await writeDependentsFixture();

    const { dependents } = await findDependentFixtures(repoRoot, [
      "plugins/demo/skills/auto-skill",
      "plugins/demo/skills/target-skill",
    ]);

    expect(dependents.map((dependent) => dependent.label)).toStrictEqual(["other:other-skill"]);
  });

  it("finds repo-local cases that route to a selected repo-local skill", async () => {
    const repoRoot = await writeDependentsFixture();

    const { dependents } = await findDependentFixtures(repoRoot, [".agents/skills/local-b"]);

    expect(dependents).toStrictEqual([
      {
        skillPath: path.join(".agents", "skills", "local-a"),
        label: "local-a",
        caseIds: ["route-to-local-b"],
        routesTo: ["local-b"],
      },
    ]);
  });

  it("returns nothing when no fixture routes to the selection", async () => {
    const repoRoot = await writeDependentsFixture();

    await expect(
      findDependentFixtures(repoRoot, ["plugins/other/skills/other-skill"]),
    ).resolves.toStrictEqual({ dependents: [], unreadableFixtures: [] });
  });

  // A fixture that fails to read or to parse may hold routing cases, so the scan reports it and
  // keeps going.
  it.each([
    {
      failure: "invalid YAML",
      breakFixture: (fixturePath: string) => writeFile(fixturePath, "version: 1\ncases: [\n"),
      message: /^invalid YAML: /,
    },
    {
      failure: "a directory at the fixture path",
      breakFixture: async (fixturePath: string) => {
        await rm(fixturePath);
        await mkdir(fixturePath);
      },
      message: /EISDIR/,
    },
  ])(
    "reports an unreadable fixture instead of aborting the scan: $failure",
    async ({ breakFixture, message }) => {
      const repoRoot = await writeDependentsFixture();
      await breakFixture(
        path.join(repoRoot, "plugins", "other", "skills", "other-skill", "evals", "triggers.yaml"),
      );

      const scan = await findDependentFixtures(repoRoot, ["plugins/demo/skills/target-skill"]);

      expect(scan.dependents.map((dependent) => dependent.label)).toStrictEqual([
        "demo:auto-skill",
      ]);
      expect(scan.unreadableFixtures.map((entry) => entry.skillPath)).toStrictEqual([
        path.join("plugins", "other", "skills", "other-skill"),
      ]);
      expect(scan.unreadableFixtures[0]?.message).toMatch(message);
    },
  );
});

describe("dependentRunOptions", () => {
  // Spec: the selection's case and fixture narrowing does not carry over to dependents.
  it("replaces the selection's narrowing with the dependent's own cases", () => {
    const options = dependentRunOptions(
      {
        repoRoot: "/repo",
        caseIds: ["selected-case"],
        fixturePath: "custom.yaml",
        model: "gpt-5",
        force: true,
      },
      {
        skillPath: "plugins/other/skills/other-skill",
        label: "other:other-skill",
        caseIds: ["first-route", "second-route"],
        routesTo: ["demo:target-skill"],
      },
    );

    expect(options).toStrictEqual({
      repoRoot: "/repo",
      model: "gpt-5",
      force: true,
      skillPath: "plugins/other/skills/other-skill",
      caseIds: ["first-route", "second-route"],
    });
  });
});

describe("selectDependentsForAgent", () => {
  // Spec: "run them on the lanes their own fixture runs on".
  it("runs plugin dependents only on agents whose catalog lists the owning plugin", async () => {
    const repoRoot = await writeDependentsFixture();
    const { dependents } = await findDependentFixtures(repoRoot, [
      "plugins/demo/skills/target-skill",
    ]);

    const onClaude = await selectDependentsForAgent(repoRoot, dependents, "claude");
    const onCodex = await selectDependentsForAgent(repoRoot, dependents, "codex");

    expect(onClaude.runnable.map((dependent) => dependent.label)).toStrictEqual([
      "demo:auto-skill",
    ]);
    expect(onClaude.skipped).toStrictEqual([
      {
        label: "other:other-skill",
        reason: "plugin other is not in the claude marketplace catalog",
      },
    ]);
    expect(onCodex.runnable.map((dependent) => dependent.label)).toStrictEqual([
      "demo:auto-skill",
      "other:other-skill",
    ]);
    expect(onCodex.skipped).toStrictEqual([]);
  });

  it("skips dependents whose owning skill is manual-only on the agent", async () => {
    const repoRoot = await writeDependentsFixture({ manualOnlyLocalA: true });
    const { dependents } = await findDependentFixtures(repoRoot, [".agents/skills/local-b"]);

    const selected = await selectDependentsForAgent(repoRoot, dependents, "codex");

    expect(selected.runnable).toStrictEqual([]);
    expect(selected.skipped).toStrictEqual([
      { label: "local-a", reason: "local-a is manual-only on codex" },
    ]);
  });
});

type FixtureOptions = { manualOnlyLocalA?: boolean };

// Plugin "demo" is in both catalogs and plugin "other" only in the Codex catalog. Every skill but
// local-b owns a fixture; the routing cases in them are what the scan looks for.
async function writeDependentsFixture(options: FixtureOptions = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-dependents-"));
  const demoSkills = path.join(repoRoot, "plugins", "demo", "skills");
  const localSkills = path.join(repoRoot, ".agents", "skills");

  await writePlugin(repoRoot, "demo", { claude: true, codex: true });
  await writePlugin(repoRoot, "other", { claude: false, codex: true });
  await writeSkillFiles(path.join(demoSkills, "target-skill"), { fixture: routingFixture([]) });
  await writeSkillFiles(path.join(demoSkills, "auto-skill"), {
    fixture: routingFixture([{ id: "route-to-target", to: "demo:target-skill" }]),
  });
  await writeSkillFiles(path.join(repoRoot, "plugins", "other", "skills", "other-skill"), {
    fixture: routingFixture([
      { id: "first-route", to: "demo:target-skill" },
      { id: "unrelated-route", to: "demo:auto-skill" },
      { id: "second-route", to: "demo:target-skill" },
    ]),
  });
  await writeSkillFiles(path.join(localSkills, "local-a"), {
    fixture: routingFixture([{ id: "route-to-local-b", to: "local-b" }]),
    manualOnly: options.manualOnlyLocalA === true,
  });
  await writeSkillFiles(path.join(localSkills, "local-b"));
  await writeMarketplaceCatalogs(repoRoot, { codex: ["demo", "other"], claude: ["demo"] });

  return repoRoot;
}

async function writePlugin(
  repoRoot: string,
  pluginName: string,
  targets: { claude: boolean; codex: boolean },
): Promise<void> {
  const pluginPath = path.join(repoRoot, "plugins", pluginName);
  if (targets.claude) {
    await mkdir(path.join(pluginPath, ".claude-plugin"), { recursive: true });
    await writeFile(
      path.join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: pluginName, version: "1.0.0", description: "Fixture plugin" }),
    );
  }
  await mkdir(pluginPath, { recursive: true });
  await writeFile(
    path.join(pluginPath, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: pluginName,
      version: "1.0.0",
      ...(targets.codex ? { extensions: { "com.openai": {} } } : {}),
    }),
  );
}

// A fixture with one plain invoke case, one plain skip case, and a skip case per route.
function routingFixture(routes: Array<{ id: string; to: string }>): string {
  return triggerFixtureYaml([
    { id: "invoke-case", expect: "invoke" },
    { id: "plain-skip", expect: "skip" },
    ...routes.map((route): FixtureCase => ({
      id: route.id,
      expect: "skip",
      prompt: `Route to ${route.to}.`,
      invokeInstead: route.to,
    })),
  ]);
}
