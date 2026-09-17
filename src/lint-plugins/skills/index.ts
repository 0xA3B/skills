import path from "node:path";

import { error, type ValidationContext } from "../diagnostics.js";
import { isDirectory, pathExists, readdirNames } from "../files.js";
import type { PluginTargets } from "../types.js";
import { validateSkillFrontmatter } from "./agentskills.js";
import { validateOpenAiMetadata } from "./openai-metadata.js";
import { validateTriggerFixture } from "./trigger-fixture.js";

// Agent Plugins 1.0.0 discovers skills at the fixed location skills/, and Claude Code auto-discovers
// the same directory, so no manifest field names it.
export async function validateSkillsForPlugin(
  context: ValidationContext,
  pluginPath: string,
  targets: PluginTargets,
): Promise<void> {
  const skillsPath = path.join(pluginPath, "skills");
  if (!(await isDirectory(skillsPath))) {
    return;
  }

  await validateSkills(context, skillsPath, targets);
}

export async function validateSkills(
  context: ValidationContext,
  skillsPath: string,
  targets: PluginTargets,
): Promise<void> {
  const skillDirs = await readdirNames(skillsPath);

  if (skillDirs.length === 0) {
    error(context, "skills/non-empty", skillsPath, "Expected at least one skill directory.");
  }

  for (const skillName of skillDirs) {
    const skillPath = path.join(skillsPath, skillName);
    await validateSkill(context, skillName, skillPath, targets);
  }
}

export async function validateSkill(
  context: ValidationContext,
  skillName: string,
  skillPath: string,
  targets: PluginTargets,
): Promise<void> {
  const skillFilePath = path.join(skillPath, "SKILL.md");
  if (!(await pathExists(skillFilePath))) {
    error(context, "agentskills/missing-file", skillFilePath, "Missing SKILL.md.");
    return;
  }

  const frontmatter = await validateSkillFrontmatter(context, skillName, skillFilePath);
  await validateTriggerFixture(context, skillPath, targets);
  const metadataPath = path.join(skillPath, "agents", "openai.yaml");
  if (!(await pathExists(metadataPath))) {
    if (targets.codex) {
      error(
        context,
        "repo/openai-metadata-required",
        metadataPath,
        "Missing agents/openai.yaml. Codex-targeted plugins require OpenAI skill metadata for every skill.",
      );
    }
    return;
  }

  const metadata = await validateOpenAiMetadata(context, skillName, metadataPath);

  if (metadata.allowImplicitInvocation !== undefined) {
    const expected = !metadata.allowImplicitInvocation;
    const actual = frontmatter.disableModelInvocation ?? false;
    if (actual !== expected) {
      error(
        context,
        "repo/invocation-policy-parity",
        skillFilePath,
        `Frontmatter "disable-model-invocation" (${String(frontmatter.disableModelInvocation ?? "absent")}) must mirror agents/openai.yaml "policy.allow_implicit_invocation" (${String(metadata.allowImplicitInvocation)}). Manual-only skills need "disable-model-invocation: true"; implicitly invokable skills must omit the key or set it to false.`,
        "/frontmatter/disable-model-invocation",
      );
    }
  }
}
