import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type { SkillTarget } from "./types.js";

type OpenAiMetadata = {
  policy?: {
    allow_implicit_invocation?: boolean;
  };
};

export function resolveSkillTarget(repoRoot: string, skillPathArgument: string): SkillTarget {
  const skillPath = path.resolve(repoRoot, skillPathArgument);
  const relativeParts = path.relative(repoRoot, skillPath).split(path.sep);

  if (
    relativeParts.length !== 4 ||
    relativeParts[0] !== "codex_plugins" ||
    relativeParts[2] !== "skills"
  ) {
    throw new Error(
      `Expected a repo plugin skill path like codex_plugins/<plugin>/skills/<skill>; received ${skillPathArgument}.`,
    );
  }

  const pluginName = relativeParts[1];
  const skillName = relativeParts[3];
  if (pluginName === undefined || skillName === undefined) {
    throw new Error(`Unable to resolve plugin and skill names from ${skillPathArgument}.`);
  }

  return {
    repoRoot,
    pluginName,
    skillName,
    pluginPath: path.join(repoRoot, "codex_plugins", pluginName),
    skillPath,
    skillFilePath: path.join(skillPath, "SKILL.md"),
    metadataPath: path.join(skillPath, "agents", "openai.yaml"),
    fixturePath: path.join(skillPath, "evals", "triggers.yaml"),
  };
}

export async function readAllowImplicitInvocation(target: SkillTarget): Promise<boolean> {
  const metadata = parseYaml(await readFile(target.metadataPath, "utf8")) as OpenAiMetadata;
  return metadata.policy?.allow_implicit_invocation === true;
}
