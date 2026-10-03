import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseSkillLabel,
  readSkillFileAllowImplicitInvocation,
  resolveSkill,
  resolveSkillLabel,
  type Skill,
  formatSkillLabel,
} from "../../skills/index.js";
import {
  type FixturePath,
  parseTriggerFixture,
  type TriggerFixture,
} from "../../trigger-evals/fixtures/index.js";
import { error, type ValidationContext } from "../diagnostics.js";
import { isDirectory, pathExists } from "../files.js";
import type { FindMissingPluginTargets } from "../repository.js";
import type { PluginTargets } from "../types.js";

// The two skill layouts a fixture can live in. Alternates named by invoke-instead are resolved
// against the same layouts, so a plugin fixture names <plugin>:<skill> and a repo-local fixture
// names a bare skill name.
type FixtureKind = Skill["kind"];

// Lints evals/triggers.yaml when a skill ships one: every loader finding becomes a
// trigger-fixture/schema diagnostic, and a fixture that parses cleanly is cross-checked against
// the skills and seeds it names. Skills without a fixture are not linted here.
export async function validateTriggerFixture(
  context: ValidationContext,
  skillPath: string,
  targets: PluginTargets,
  missingTargets: FindMissingPluginTargets,
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
      toJsonPointer(finding.path),
    );
  }
  if (fixture === undefined) {
    return;
  }

  const ownTarget = fixtureTarget(context.repoRoot, skillPath);
  for (const [index, testCase] of fixture.cases.entries()) {
    if (testCase.invokeInstead === undefined || ownTarget === undefined) {
      continue;
    }
    await validateAlternate(
      context,
      {
        fixturePath,
        kind: ownTarget.kind,
        targets,
        ownLabel: formatSkillLabel(ownTarget),
        label: testCase.invokeInstead,
        caseIndex: index,
      },
      missingTargets,
    );
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

async function validateAlternate(
  context: ValidationContext,
  check: AlternateCheck,
  missingTargets: FindMissingPluginTargets,
): Promise<void> {
  const { fixturePath, kind, targets, ownLabel, label, caseIndex } = check;
  const pointer = toJsonPointer(["cases", caseIndex, "invoke-instead"]);
  const { pluginName } = parseSkillLabel(label);
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

  const { skillPath, skillFilePath } = resolveSkillLabel(context.repoRoot, label);
  if (!(await pathExists(skillFilePath))) {
    error(
      context,
      "trigger-fixture/alternate-missing",
      fixturePath,
      `invoke-instead names "${label}", but ${toPosix(path.relative(context.repoRoot, skillPath))} has no SKILL.md.`,
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
  for (const target of missingTargets(pluginName, targets)) {
    error(
      context,
      "trigger-fixture/alternate-target",
      fixturePath,
      `invoke-instead names "${label}", but plugin "${pluginName}" does not ship on ${target}, where this fixture also runs.`,
      pointer,
    );
  }
}

// A case that inherited the fixture-level default holds that same object, so a missing default
// seed is reported once at the default and a case's own seed at the case.
async function validateSeeds(
  context: ValidationContext,
  fixturePath: string,
  fixture: TriggerFixture,
): Promise<void> {
  const checks: Array<{ seed: string; pointer: string | undefined }> = [];
  if (fixture.workspace !== undefined) {
    checks.push({ seed: fixture.workspace.seed, pointer: toJsonPointer(["workspace", "seed"]) });
  }
  for (const [index, testCase] of fixture.cases.entries()) {
    if (testCase.workspace !== undefined && testCase.workspace !== fixture.workspace) {
      checks.push({
        seed: testCase.workspace.seed,
        pointer: toJsonPointer(["cases", index, "workspace", "seed"]),
      });
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

// Standalone skill validation also accepts directories outside the repository layouts. Such
// fixtures still receive schema and seed checks, but have no repository identity for routing.
function fixtureTarget(repoRoot: string, skillPath: string): Skill | undefined {
  try {
    return resolveSkill(repoRoot, skillPath);
  } catch {
    return undefined;
  }
}

// Every fixture pointer this rule reports, as an RFC 6901 JSON pointer like the rest of the
// linter's rules. The root path reports no pointer.
function toJsonPointer(fixturePath: FixturePath): string | undefined {
  if (fixturePath.length === 0) {
    return undefined;
  }
  return fixturePath
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
