import { readdir, stat } from "node:fs/promises";
import path from "node:path";

type SkillBase = {
  repoRoot: string;
  skillName: string;
  skillPath: string;
  skillFilePath: string;
  metadataPath: string;
  fixturePath: string;
};

export type PluginSkill = SkillBase & {
  kind: "plugin";
  pluginName: string;
  pluginPath: string;
};

export type RepoLocalSkill = SkillBase & {
  kind: "repo-local";
};

// A skill identified by its place in this repository's two layouts: a plugin skill under
// plugins/<plugin>/skills/<skill>, or a repo-local skill under .agents/skills/<skill>.
export type Skill = PluginSkill | RepoLocalSkill;

// One skill directory found by listing: a direct child of a skills root that holds a SKILL.md.
export type SkillDirectory = {
  skillName: string;
  skillPath: string;
};

export function resolveSkill(repoRoot: string, skillPathArgument: string): Skill {
  const skillPath = path.resolve(repoRoot, skillPathArgument);
  const relativeParts = path.relative(repoRoot, skillPath).split(path.sep);

  if (isRepoLocalSkillPath(relativeParts)) {
    const skillName = relativeParts[2];
    if (skillName === undefined) {
      throw new Error(`Unable to resolve skill name from ${skillPathArgument}.`);
    }

    return { kind: "repo-local", repoRoot, skillName, ...skillFiles(skillPath) };
  }

  if (!isPluginSkillPath(relativeParts)) {
    throw new Error(
      `Expected a skill path like plugins/<plugin>/skills/<skill> or .agents/skills/<skill>; received ${skillPathArgument}.`,
    );
  }

  const pluginName = relativeParts[1];
  const skillName = relativeParts[3];
  if (pluginName === undefined || skillName === undefined) {
    throw new Error(`Unable to resolve plugin and skill names from ${skillPathArgument}.`);
  }

  return {
    kind: "plugin",
    repoRoot,
    pluginName,
    skillName,
    pluginPath: path.join(repoRoot, "plugins", pluginName),
    ...skillFiles(skillPath),
  };
}

function skillFiles(
  skillPath: string,
): Pick<SkillBase, "skillPath" | "skillFilePath" | "metadataPath" | "fixturePath"> {
  return {
    skillPath,
    skillFilePath: path.join(skillPath, "SKILL.md"),
    metadataPath: path.join(skillPath, "agents", "openai.yaml"),
    fixturePath: path.join(skillPath, "evals", "triggers.yaml"),
  };
}

function isPluginSkillPath(relativeParts: string[]): boolean {
  return (
    relativeParts.length === 4 && relativeParts[0] === "plugins" && relativeParts[2] === "skills"
  );
}

function isRepoLocalSkillPath(relativeParts: string[]): boolean {
  return (
    relativeParts.length === 3 && relativeParts[0] === ".agents" && relativeParts[1] === "skills"
  );
}

// The label agents and fixtures use for a skill: <plugin>:<skill> for a plugin skill, the bare
// skill name for a repo-local skill.
export function formatSkillLabel(skill: Skill): string {
  return skill.kind === "plugin" ? `${skill.pluginName}:${skill.skillName}` : skill.skillName;
}

export type SkillLabel = {
  pluginName?: string;
  skillName: string;
};

// The inverse of formatSkillLabel for a label already checked against the label syntax: one colon
// separates a plugin skill's plugin and skill names; a bare name is a repo-local skill.
export function parseSkillLabel(label: string): SkillLabel {
  const separator = label.indexOf(":");
  if (separator === -1) {
    return { skillName: label };
  }
  return { pluginName: label.slice(0, separator), skillName: label.slice(separator + 1) };
}

// The skill a label names, whether or not its directory exists.
export function resolveSkillLabel(repoRoot: string, label: string): Skill {
  const { pluginName, skillName } = parseSkillLabel(label);
  return resolveSkill(
    repoRoot,
    pluginName === undefined
      ? path.join(".agents", "skills", skillName)
      : path.join("plugins", pluginName, "skills", skillName),
  );
}

// Every skill a plugin directory ships, sorted by name.
export async function listPluginSkills(pluginPath: string): Promise<SkillDirectory[]> {
  return listSkillDirectories(path.join(pluginPath, "skills"));
}

// Every repo-local skill in the checkout, sorted by name. Repo-local skills exist only here, where
// live sessions load all of them alongside the marketplace plugins.
export async function listRepoLocalSkills(repoRoot: string): Promise<RepoLocalSkill[]> {
  const skills: RepoLocalSkill[] = [];
  for (const directory of await listSkillDirectories(path.join(repoRoot, ".agents", "skills"))) {
    const skill = resolveSkill(repoRoot, directory.skillPath);
    if (skill.kind === "repo-local") {
      skills.push(skill);
    }
  }
  return skills;
}

// The one listing rule: a direct child directory of the skills root whose name does not start
// with a dot and that holds a SKILL.md. Skill names are kebab-case, so a dot-prefixed directory is
// scratch (a harness worktree, .cc-writes), not a skill. A missing root lists no skills.
async function listSkillDirectories(skillsRoot: string): Promise<SkillDirectory[]> {
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillDirectory[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const skillPath = path.join(skillsRoot, entry.name);
    try {
      await stat(path.join(skillPath, "SKILL.md"));
    } catch {
      continue;
    }
    skills.push({ skillName: entry.name, skillPath });
  }

  return skills.sort((first, second) =>
    first.skillName < second.skillName ? -1 : first.skillName > second.skillName ? 1 : 0,
  );
}
