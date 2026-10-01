import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { parseSkillDocument } from "./document.js";
import type { Skill } from "./layout.js";

// An agent a plugin ships to.
export type PluginTarget = "claude" | "codex";

type OpenAiMetadata = {
  policy?: {
    allow_implicit_invocation?: boolean;
  };
};

// Whether the agent may load the skill implicitly. Codex reads agents/openai.yaml; Claude Code
// reads SKILL.md frontmatter, and Claude-only plugins ship no agents/openai.yaml. The plugin
// linter's invocation-policy parity rule keeps both policies equivalent for dual-target skills.
export async function readAllowImplicitInvocation(
  skill: Skill,
  agent: PluginTarget,
): Promise<boolean> {
  if (agent === "claude") {
    return readSkillFileAllowImplicitInvocation(skill.skillFilePath);
  }

  let content: string;
  try {
    content = await readFile(skill.metadataPath, "utf8");
  } catch (caught) {
    throw new Error(
      `${skill.metadataPath} is missing or unreadable; Codex trigger evals require agents/openai.yaml. Use --agent claude for Claude-only plugins.`,
      { cause: caught },
    );
  }

  const metadata = parseYaml(content) as OpenAiMetadata;
  return metadata.policy?.allow_implicit_invocation === true;
}

// Frontmatter is the one invocation-policy surface every skill ships, so it also stands in for the
// Codex policy where agents/openai.yaml may be absent. Throws the YAML error for frontmatter that
// does not parse.
export async function readSkillFileAllowImplicitInvocation(
  skillFilePath: string,
): Promise<boolean> {
  const content = await readFile(skillFilePath, "utf8");
  const document = parseSkillDocument(content);
  if (document.status === "missing-frontmatter") {
    return true;
  }
  if (document.status === "invalid-yaml") {
    throw document.error;
  }
  const metadata = document.frontmatter;
  return !isRecord(metadata) || metadata["disable-model-invocation"] !== true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
