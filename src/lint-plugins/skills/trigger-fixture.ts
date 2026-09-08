import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseTriggerFixture } from "../../trigger-evals/fixtures.js";
import {
  parseSkillLabel,
  readSkillFileAllowImplicitInvocation,
  resolveSkillTarget,
  skillTargetLabel,
} from "../../trigger-evals/target.js";
import type { TriggerFixture } from "../../trigger-evals/types.js";
import { error, type ValidationContext } from "../diagnostics.js";
import { isDirectory, pathExists } from "../files.js";
import type { PluginTargets } from "../types.js";

// The two skill layouts a fixture can live in. Alternates named by invoke-instead are resolved
// against the same layouts, so a plugin fixture names <plugin>:<skill> and a repo-local fixture
// names a bare skill name.
type FixtureKind = "plugin" | "repo-local";

const PLUGIN_MANIFESTS: Record<keyof PluginTargets, string> = {
  claude: path.join(".claude-plugin", "plugin.json"),
  codex: path.join(".codex-plugin", "plugin.json"),
};

// Lints evals/triggers.yaml when a skill ships one: every loader finding becomes a
// trigger-fixture/schema diagnostic, and a fixture that parses cleanly is cross-checked against
// the skills and seeds it names. Skills without a fixture are not linted here.
export async function validateTriggerFixture(
  context: ValidationContext,
  skillPath: string,
  targets: PluginTargets,
): Promise<void> {
  const fixturePath = path.join(skillPath, "evals", "triggers.yaml");
  if (!(await pathExists(fixturePath))) {
    return;
  }

  const content = await readFile(fixturePath, "utf8");
  const { fixture, findings } = parseTriggerFixture(content);
  for (const finding of findings) {
    error(
      context,
      "trigger-fixture/schema",
      fixturePath,
      finding.message,
      toJsonPointer(finding.pointer),
    );
  }
  if (fixture === undefined) {
    return;
  }

  const kind = fixtureKind(context.repoRoot, skillPath);
  for (const [index, testCase] of fixture.cases.entries()) {
    if (testCase.invokeInstead === undefined || kind === undefined) {
      continue;
    }
    await validateAlternate(context, {
      fixturePath,
      kind,
      targets,
      ownLabel: skillTargetLabel(resolveSkillTarget(context.repoRoot, skillPath)),
      label: testCase.invokeInstead,
      caseIndex: index,
    });
  }

  await validateSeeds(context, fixturePath, fixture);
}

type AlternateCheck = {
  fixturePath: string;
  kind: FixtureKind;
  targets: PluginTargets;
  // The label of the skill that owns the fixture.
  ownLabel: string;
  label: string;
  caseIndex: number;
};

async function validateAlternate(context: ValidationContext, check: AlternateCheck): Promise<void> {
  const { fixturePath, kind, targets, ownLabel, label, caseIndex } = check;
  const pointer = `/cases/${caseIndex}/invoke-instead`;
  const { pluginName, skillName } = parseSkillLabel(label);
  if (kind === "plugin" && pluginName === undefined) {
    error(
      context,
      "trigger-fixture/alternate-kind",
      fixturePath,
      `invoke-instead names "${label}", but a plugin fixture must name a plugin skill as <plugin>:<skill>.`,
      pointer,
    );
    return;
  }
  if (kind === "repo-local" && pluginName !== undefined) {
    error(
      context,
      "trigger-fixture/alternate-kind",
      fixturePath,
      `invoke-instead names "${label}", but a repo-local fixture must name a repo-local skill by its bare name.`,
      pointer,
    );
    return;
  }

  // The fixture's own skill can never be its alternate: the assertion needs the target silent
  // and the alternate firing at once.
  if (label === ownLabel) {
    error(
      context,
      "trigger-fixture/alternate-self",
      fixturePath,
      `invoke-instead names "${label}", the fixture's own skill, which can never fire on a skip case.`,
      pointer,
    );
    return;
  }

  const relativeSkillPath =
    pluginName === undefined
      ? path.join(".agents", "skills", skillName)
      : path.join("plugins", pluginName, "skills", skillName);
  const skillFilePath = path.join(context.repoRoot, relativeSkillPath, "SKILL.md");
  if (!(await pathExists(skillFilePath))) {
    error(
      context,
      "trigger-fixture/alternate-missing",
      fixturePath,
      `invoke-instead names "${label}", but ${toPosix(relativeSkillPath)} has no SKILL.md.`,
      pointer,
    );
    return;
  }

  // An unparsable alternate frontmatter is that skill's own parse/yaml diagnostic (every plugin
  // and repo-local skill is linted), so the manual-only check is skipped rather than aborting.
  let implicitlyInvokable: boolean;
  try {
    implicitlyInvokable = await readSkillFileAllowImplicitInvocation(skillFilePath);
  } catch {
    return;
  }
  if (!implicitlyInvokable) {
    error(
      context,
      "trigger-fixture/alternate-manual-only",
      fixturePath,
      `invoke-instead names "${label}", which is manual-only and can never be an implicit route.`,
      pointer,
    );
  }

  if (pluginName === undefined) {
    return;
  }
  // A routing assertion runs on every lane the fixture's own plugin runs on, so the alternate's
  // plugin must ship on each of those targets or the assertion can never pass there.
  for (const target of ["claude", "codex"] as const) {
    if (!targets[target]) {
      continue;
    }
    const manifestPath = path.join(
      context.repoRoot,
      "plugins",
      pluginName,
      PLUGIN_MANIFESTS[target],
    );
    if (!(await pathExists(manifestPath))) {
      error(
        context,
        "trigger-fixture/alternate-target",
        fixturePath,
        `invoke-instead names "${label}", but plugin "${pluginName}" does not ship on ${target}, where this fixture also runs.`,
        pointer,
      );
    }
  }
}

// A case that inherited the fixture-level default holds that same object, so a missing default
// seed is reported once at the default and a case's own seed at the case.
async function validateSeeds(
  context: ValidationContext,
  fixturePath: string,
  fixture: TriggerFixture,
): Promise<void> {
  const checks: Array<{ seed: string; pointer: string }> = [];
  if (fixture.workspace !== undefined) {
    checks.push({ seed: fixture.workspace.seed, pointer: "/workspace/seed" });
  }
  for (const [index, testCase] of fixture.cases.entries()) {
    if (testCase.workspace !== undefined && testCase.workspace !== fixture.workspace) {
      checks.push({ seed: testCase.workspace.seed, pointer: `/cases/${index}/workspace/seed` });
    }
  }
  for (const { seed, pointer } of checks) {
    const seedPath = path.join("evals", "seeds", seed);
    if (await isDirectory(path.join(context.repoRoot, seedPath))) {
      continue;
    }
    error(
      context,
      "trigger-fixture/seed-missing",
      fixturePath,
      `workspace seed "${seed}" has no directory at ${toPosix(seedPath)}.`,
      pointer,
    );
  }
}

function fixtureKind(repoRoot: string, skillPath: string): FixtureKind | undefined {
  const segments = path.relative(repoRoot, skillPath).split(path.sep);
  if (segments.length === 4 && segments[0] === "plugins" && segments[2] === "skills") {
    return "plugin";
  }
  if (segments.length === 3 && segments[0] === ".agents" && segments[1] === "skills") {
    return "repo-local";
  }
  return undefined;
}

// Loader pointers use the fixture's own vocabulary (cases[3].workspace_files["src/a.ts"], with
// JSON-quoted file-map keys); the linter reports JSON pointers like the rest of its rules.
function toJsonPointer(pointer: string): string | undefined {
  if (pointer === "") {
    return undefined;
  }
  const tokens: string[] = [];
  const tokenPattern = /\["(?<quoted>(?:[^"\\]|\\.)*)"\]|\[(?<index>\d+)\]|(?<key>[^.[\]"]+)/g;
  for (const match of pointer.matchAll(tokenPattern)) {
    const quoted = match.groups?.["quoted"];
    tokens.push(
      quoted === undefined
        ? (match.groups?.["index"] ?? match.groups?.["key"] ?? "")
        : (JSON.parse(`"${quoted}"`) as string),
    );
  }
  return tokens.map((token) => `/${token.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
