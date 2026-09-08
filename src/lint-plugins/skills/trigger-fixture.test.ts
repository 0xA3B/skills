import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createTestContext,
  diagnosticByRule,
  diagnosticPointers,
  ruleIds,
  validOpenAiMetadata,
  validSkillMarkdown,
  withTempRepo,
  writeJson,
  writeText,
  writeValidPluginRepo,
} from "../test-utils.js";
import { validateTriggerFixture } from "./trigger-fixture.js";

const bothTargets = { claude: true, codex: true };
const HELLO_SKILL = "plugins/demo-plugin/skills/hello";

async function writeImplicitSkill(repoRoot: string, skillPath: string, name: string) {
  await writeText(
    repoRoot,
    `${skillPath}/SKILL.md`,
    validSkillMarkdown({
      frontmatter: { description: `Use when the user asks for ${name}.`, name },
    }),
  );
  await writeJson(
    repoRoot,
    `${skillPath}/agents/openai.yaml`,
    validOpenAiMetadata({ policy: { allow_implicit_invocation: true } }),
  );
}

function fixtureWithSkip(extraSkipKeys: string): string {
  return `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
${extraSkipKeys}`;
}

describe("validateTriggerFixture", () => {
  it("accepts a skill without a trigger fixture", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  // Spec: "The linter calls the same parse, maps each finding to trigger-fixture/schema".
  it("maps every loader finding to trigger-fixture/schema with a JSON pointer", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const fixturePath = await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
    invoke-instead: demo-plugin:auto
  - id: skip-case
    prompt: Do something else.
    expect: skip
    workspace:
      seed: Bad Seed
`,
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(context.diagnostics).toStrictEqual([
        {
          filePath: fixturePath,
          message: "expected cases[0].invoke-instead only on expect: skip cases.",
          pointer: "/cases/0/invoke-instead",
          ruleId: "trigger-fixture/schema",
          severity: "error",
        },
        {
          filePath: fixturePath,
          message: "expected cases[1].workspace.seed to be a kebab-case seed name.",
          pointer: "/cases/1/workspace/seed",
          ruleId: "trigger-fixture/schema",
          severity: "error",
        },
      ]);
    });
  });

  it("escapes file-map keys in JSON pointers", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        `version: 1
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
    workspace_files:
      'src/a~b"c.ts': 3
  - id: skip-case
    prompt: Do something else.
    expect: skip
`,
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(diagnosticPointers(context, "trigger-fixture/schema")).toStrictEqual([
        '/cases/0/workspace_files/src~1a~0b"c.ts',
      ]);
    });
  });

  it("reports invalid YAML as one schema diagnostic", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(repoRoot, `${HELLO_SKILL}/evals/triggers.yaml`, "cases: [\n");
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(ruleIds(context)).toStrictEqual(["trigger-fixture/schema"]);
      expect(diagnosticByRule(context, "trigger-fixture/schema")?.message).toMatch(
        /^invalid YAML: /,
      );
    });
  });

  // Spec: "alternate exists and is implicitly invokable (not manual-only); alternate kind equals
  // fixture kind; alternate's plugin ships on every plugin target the fixture's plugin ships on".
  it("accepts an implicitly invokable same-kind alternate that ships on the fixture's targets", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeImplicitSkill(repoRoot, "plugins/demo-plugin/skills/auto", "auto");
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: demo-plugin:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  it("reports an alternate that names the fixture's own skill", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeImplicitSkill(repoRoot, "plugins/demo-plugin/skills/auto", "auto");
      await writeText(
        repoRoot,
        "plugins/demo-plugin/skills/auto/evals/triggers.yaml",
        fixtureWithSkip("    invoke-instead: demo-plugin:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(
        context,
        path.join(repoRoot, "plugins/demo-plugin/skills/auto"),
        bothTargets,
      );

      expect(ruleIds(context)).toStrictEqual(["trigger-fixture/alternate-self"]);
      expect(diagnosticByRule(context, "trigger-fixture/alternate-self")?.message).toBe(
        'invoke-instead names "demo-plugin:auto", the fixture\'s own skill, which can never fire on a skip case.',
      );
    });
  });

  it("reports an alternate that does not exist", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      const fixturePath = await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: demo-plugin:nope\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(context.diagnostics).toStrictEqual([
        {
          filePath: fixturePath,
          message:
            'invoke-instead names "demo-plugin:nope", but plugins/demo-plugin/skills/nope has no SKILL.md.',
          pointer: "/cases/1/invoke-instead",
          ruleId: "trigger-fixture/alternate-missing",
          severity: "error",
        },
      ]);
    });
  });

  it("reports a manual-only alternate", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeImplicitSkill(repoRoot, "plugins/demo-plugin/skills/auto", "auto");
      await writeText(
        repoRoot,
        "plugins/demo-plugin/skills/auto/evals/triggers.yaml",
        fixtureWithSkip("    invoke-instead: demo-plugin:hello\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(
        context,
        path.join(repoRoot, "plugins/demo-plugin/skills/auto"),
        bothTargets,
      );

      expect(ruleIds(context)).toStrictEqual(["trigger-fixture/alternate-manual-only"]);
      expect(diagnosticByRule(context, "trigger-fixture/alternate-manual-only")?.message).toBe(
        'invoke-instead names "demo-plugin:hello", which is manual-only and can never be an implicit route.',
      );
    });
  });

  it("leaves an alternate with unparsable frontmatter to that skill's own diagnostics", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        "plugins/demo-plugin/skills/auto/SKILL.md",
        "---\ndescription: [unclosed\n---\n\n# Auto\n",
      );
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: demo-plugin:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  it("reports a cross-kind alternate in either direction", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeImplicitSkill(repoRoot, "plugins/demo-plugin/skills/auto", "auto");
      await writeImplicitSkill(repoRoot, ".agents/skills/local-skill", "local-skill");
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: local-skill\n"),
      );
      await writeText(
        repoRoot,
        ".agents/skills/local-skill/evals/triggers.yaml",
        fixtureWithSkip("    invoke-instead: demo-plugin:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);
      await validateTriggerFixture(
        context,
        path.join(repoRoot, ".agents/skills/local-skill"),
        bothTargets,
      );

      expect(ruleIds(context)).toStrictEqual([
        "trigger-fixture/alternate-kind",
        "trigger-fixture/alternate-kind",
      ]);
      expect(context.diagnostics.map((diagnostic) => diagnostic.message)).toStrictEqual([
        'invoke-instead names "local-skill", but a plugin fixture must name a plugin skill as <plugin>:<skill>.',
        'invoke-instead names "demo-plugin:auto", but a repo-local fixture must name a repo-local skill by its bare name.',
      ]);
    });
  });

  it("reports an alternate whose plugin does not ship on every target of the fixture's plugin", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeImplicitSkill(repoRoot, "plugins/codex-only/skills/auto", "auto");
      await writeJson(repoRoot, "plugins/codex-only/.codex-plugin/plugin.json", {
        name: "codex-only",
      });
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: codex-only:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(ruleIds(context)).toStrictEqual(["trigger-fixture/alternate-target"]);
      expect(diagnosticByRule(context, "trigger-fixture/alternate-target")?.message).toBe(
        'invoke-instead names "codex-only:auto", but plugin "codex-only" does not ship on claude, where this fixture also runs.',
      );
    });
  });

  it("checks only the targets the fixture's own plugin ships on", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot, { claudeManifest: false, claudeMarketplace: false });
      await writeImplicitSkill(repoRoot, "plugins/codex-only/skills/auto", "auto");
      await writeJson(repoRoot, "plugins/codex-only/.codex-plugin/plugin.json", {
        name: "codex-only",
      });
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        fixtureWithSkip("    invoke-instead: codex-only:auto\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), {
        claude: false,
        codex: true,
      });

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  it("accepts a repo-local alternate by bare name", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeImplicitSkill(repoRoot, ".agents/skills/local-skill", "local-skill");
      await writeImplicitSkill(repoRoot, ".agents/skills/other-skill", "other-skill");
      await writeText(
        repoRoot,
        ".agents/skills/local-skill/evals/triggers.yaml",
        fixtureWithSkip("    invoke-instead: other-skill\n"),
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(
        context,
        path.join(repoRoot, ".agents/skills/local-skill"),
        bothTargets,
      );

      expect(ruleIds(context)).toStrictEqual([]);
    });
  });

  // Spec: "then runs the cross-reference rules (alternate checks, seed directory exists)".
  it("reports a workspace seed that has no directory under evals/seeds", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        `version: 1
workspace:
  seed: node-service
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
    workspace:
      seed: other-seed
`,
      );
      await writeText(repoRoot, "evals/seeds/node-service/package.json", "{}\n");
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(context.diagnostics).toStrictEqual([
        {
          filePath: path.join(repoRoot, HELLO_SKILL, "evals", "triggers.yaml"),
          message: 'workspace seed "other-seed" has no directory at evals/seeds/other-seed.',
          pointer: "/cases/1/workspace/seed",
          ruleId: "trigger-fixture/seed-missing",
          severity: "error",
        },
      ]);
    });
  });

  it("reports a missing fixture-level seed once, at the default", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(
        repoRoot,
        `${HELLO_SKILL}/evals/triggers.yaml`,
        `version: 1
workspace:
  seed: absent-default
cases:
  - id: invoke-case
    prompt: Do the thing.
    expect: invoke
  - id: skip-case
    prompt: Do something else.
    expect: skip
  - id: own-seed
    prompt: Do a third thing.
    expect: skip
    workspace:
      seed: absent-own
`,
      );
      const context = createTestContext(repoRoot);

      await validateTriggerFixture(context, path.join(repoRoot, HELLO_SKILL), bothTargets);

      expect(diagnosticPointers(context, "trigger-fixture/seed-missing")).toStrictEqual([
        "/workspace/seed",
        "/cases/2/workspace/seed",
      ]);
    });
  });
});
