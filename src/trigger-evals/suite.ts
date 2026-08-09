import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { listMarketplacePlugins } from "./marketplace.js";
import { readAllowImplicitInvocation, resolveSkillTarget } from "./target.js";
import type { TriggerEvalAgent } from "./types.js";

export type TriggerEvalSuite = {
  // Repo-relative paths of implicitly invokable skills with trigger fixtures, in run order.
  skillPaths: string[];
  // Repo-relative paths of skills excluded because they are manual-only for the agent, even
  // though they ship trigger fixtures.
  manualOnlySkillPaths: string[];
  // Repo-relative selected paths excluded because their plugin is not in the agent's marketplace
  // catalog. Only marketplace-mode selections populate this.
  outOfCatalogSkillPaths: string[];
};

// One plugin's suite: every skill in the plugin that ships trigger fixtures, partitioned by the
// agent's invocation policy so manual-only skills are reported instead of warned about per run.
export async function selectPluginSuite(
  repoRoot: string,
  pluginPathArgument: string,
  agent: TriggerEvalAgent,
): Promise<TriggerEvalSuite> {
  const pluginPath = path.resolve(repoRoot, pluginPathArgument);
  const relativeParts = path.relative(repoRoot, pluginPath).split(path.sep);
  if (relativeParts.length !== 2 || relativeParts[0] !== "plugins") {
    throw new Error(
      `Expected a plugin path like plugins/<plugin>; received ${pluginPathArgument}.`,
    );
  }

  const suite = await selectSkillsWithFixtures(repoRoot, pluginPath, agent);
  if (suite.skillPaths.length === 0 && suite.manualOnlySkillPaths.length === 0) {
    throw new Error(`${pluginPathArgument} has no skills with trigger fixtures.`);
  }

  return suite;
}

// The whole marketplace's suite for one agent, read from that agent's catalog: the Claude and
// Codex catalogs list different plugin sets. A non-empty selection narrows execution, not
// staging: the runner still stages the full marketplace, so a selected skill competes against
// every catalog description while only its own fixtures run.
export async function selectMarketplaceSuite(
  repoRoot: string,
  agent: TriggerEvalAgent,
  selectedSkillPaths: string[] = [],
): Promise<TriggerEvalSuite> {
  const suite: TriggerEvalSuite = {
    skillPaths: [],
    manualOnlySkillPaths: [],
    outOfCatalogSkillPaths: [],
  };
  for (const entry of await listMarketplacePlugins(repoRoot, agent)) {
    const pluginSuite = await selectSkillsWithFixtures(repoRoot, entry.pluginPath, agent);
    suite.skillPaths.push(...pluginSuite.skillPaths);
    suite.manualOnlySkillPaths.push(...pluginSuite.manualOnlySkillPaths);
  }

  if (suite.skillPaths.length === 0 && suite.manualOnlySkillPaths.length === 0) {
    throw new Error(`The ${agent} marketplace has no skills with trigger fixtures.`);
  }

  if (selectedSkillPaths.length === 0) {
    return suite;
  }

  return filterMarketplaceSuite(repoRoot, suite, selectedSkillPaths);
}

// Keep suite order for the selected subset so a selective run matches the full run's ordering.
// Selected paths that exist with fixtures but sit outside this agent's catalog are reported, not
// fatal, so one --agent both invocation can name skills from single-agent plugins; anything else
// unmatched is a typo or a fixtureless skill and fails loudly.
async function filterMarketplaceSuite(
  repoRoot: string,
  suite: TriggerEvalSuite,
  selectedSkillPaths: string[],
): Promise<TriggerEvalSuite> {
  const selected = new Set(
    selectedSkillPaths.map((argument) => path.relative(repoRoot, path.resolve(repoRoot, argument))),
  );

  const filtered: TriggerEvalSuite = {
    skillPaths: suite.skillPaths.filter((skillPath) => selected.has(skillPath)),
    manualOnlySkillPaths: suite.manualOnlySkillPaths.filter((skillPath) => selected.has(skillPath)),
    outOfCatalogSkillPaths: [],
  };

  const matched = new Set([...filtered.skillPaths, ...filtered.manualOnlySkillPaths]);
  for (const selectedPath of selected) {
    if (matched.has(selectedPath)) {
      continue;
    }

    const target = resolveSkillTarget(repoRoot, selectedPath);
    if (target.kind !== "plugin") {
      throw new Error(`--marketplace runs plugin skills; ${selectedPath} is a repo-local skill.`);
    }
    try {
      await stat(target.fixturePath);
    } catch {
      throw new Error(`${selectedPath} has no trigger fixture at evals/triggers.yaml.`);
    }

    filtered.outOfCatalogSkillPaths.push(selectedPath);
  }

  return filtered;
}

async function selectSkillsWithFixtures(
  repoRoot: string,
  pluginPath: string,
  agent: TriggerEvalAgent,
): Promise<TriggerEvalSuite> {
  const skillsPath = path.join(pluginPath, "skills");
  let entries;
  try {
    entries = await readdir(skillsPath, { withFileTypes: true });
  } catch {
    return { skillPaths: [], manualOnlySkillPaths: [], outOfCatalogSkillPaths: [] };
  }

  const suite: TriggerEvalSuite = {
    skillPaths: [],
    manualOnlySkillPaths: [],
    outOfCatalogSkillPaths: [],
  };
  const skillNames = entries
    .filter((candidate) => candidate.isDirectory())
    .map((candidate) => candidate.name)
    .sort();
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsPath, skillName);
    try {
      await stat(path.join(skillPath, "evals", "triggers.yaml"));
    } catch {
      continue;
    }

    const relativeSkillPath = path.relative(repoRoot, skillPath);
    const target = resolveSkillTarget(repoRoot, relativeSkillPath);
    if (await readAllowImplicitInvocation(target, agent)) {
      suite.skillPaths.push(relativeSkillPath);
    } else {
      suite.manualOnlySkillPaths.push(relativeSkillPath);
    }
  }

  return suite;
}
