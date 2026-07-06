import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { isRecord } from "./json.js";
import type { SkillTarget, TriggerEvalAgent } from "./types.js";

type OpenAiMetadata = {
  policy?: {
    allow_implicit_invocation?: boolean;
  };
};

export function resolveSkillTarget(repoRoot: string, skillPathArgument: string): SkillTarget {
  const skillPath = path.resolve(repoRoot, skillPathArgument);
  const relativeParts = path.relative(repoRoot, skillPath).split(path.sep);

  if (isRepoLocalSkillPath(relativeParts)) {
    const skillName = relativeParts[2];
    if (skillName === undefined) {
      throw new Error(`Unable to resolve skill name from ${skillPathArgument}.`);
    }

    return {
      kind: "repo-local",
      repoRoot,
      skillName,
      skillPath,
      skillFilePath: path.join(skillPath, "SKILL.md"),
      metadataPath: path.join(skillPath, "agents", "openai.yaml"),
      fixturePath: path.join(skillPath, "evals", "triggers.yaml"),
    };
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

export async function readAllowImplicitInvocation(
  target: SkillTarget,
  agent: TriggerEvalAgent,
): Promise<boolean> {
  if (agent === "claude") {
    return readClaudeAllowImplicitInvocation(target);
  }

  let content: string;
  try {
    content = await readFile(target.metadataPath, "utf8");
  } catch (caught) {
    throw new Error(
      `${target.metadataPath} is missing or unreadable; Codex trigger evals require agents/openai.yaml. Use --agent claude for Claude-only plugins.`,
      { cause: caught },
    );
  }

  const metadata = parseYaml(content) as OpenAiMetadata;
  return metadata.policy?.allow_implicit_invocation === true;
}

// Claude Code derives invocability from SKILL.md frontmatter, and Claude-only plugins ship no
// agents/openai.yaml, so the Claude lane reads the frontmatter directly. The linter's
// invocation-policy parity rule keeps both policies equivalent for dual-target skills.
async function readClaudeAllowImplicitInvocation(target: SkillTarget): Promise<boolean> {
  const content = await readFile(target.skillFilePath, "utf8");
  const frontmatterMatch = content.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatter = frontmatterMatch?.groups?.["frontmatter"];
  if (frontmatter === undefined) {
    return true;
  }

  const metadata = parseYaml(frontmatter) as unknown;
  return !isRecord(metadata) || metadata["disable-model-invocation"] !== true;
}

export function skillTargetLabel(target: SkillTarget): string {
  return target.kind === "plugin" ? `${target.pluginName}:${target.skillName}` : target.skillName;
}
