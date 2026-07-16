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
// Codex catalogs list different plugin sets.
export async function selectMarketplaceSuite(
  repoRoot: string,
  agent: TriggerEvalAgent,
): Promise<TriggerEvalSuite> {
  const skillPaths: string[] = [];
  const manualOnlySkillPaths: string[] = [];
  for (const entry of await listMarketplacePlugins(repoRoot, agent)) {
    const suite = await selectSkillsWithFixtures(repoRoot, entry.pluginPath, agent);
    skillPaths.push(...suite.skillPaths);
    manualOnlySkillPaths.push(...suite.manualOnlySkillPaths);
  }

  if (skillPaths.length === 0 && manualOnlySkillPaths.length === 0) {
    throw new Error(`The ${agent} marketplace has no skills with trigger fixtures.`);
  }

  return { skillPaths, manualOnlySkillPaths };
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
    return { skillPaths: [], manualOnlySkillPaths: [] };
  }

  const suite: TriggerEvalSuite = { skillPaths: [], manualOnlySkillPaths: [] };
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
