import { readdir } from "node:fs/promises";
import path from "node:path";

import { error, type ValidationContext } from "../diagnostics.js";
import { isDirectory, pathExists } from "../files.js";
import { resolveRelativePath } from "../paths.js";
import type { JsonObject, LocalCatalogEntry } from "../types.js";
import { validateSkillFrontmatter } from "./agentskills.js";
import { validateOpenAiMetadata } from "./openai-metadata.js";

export async function validateSkillsForEntry(
  context: ValidationContext,
  entry: LocalCatalogEntry,
  manifest: JsonObject,
): Promise<void> {
  const skillsReference = typeof manifest["skills"] === "string" ? manifest["skills"] : "./skills/";
  const skillsPath = resolveRelativePath(
    context,
    skillsReference,
    entry.pluginPath,
    entry.manifestPath,
    "/skills",
    "manifest/path",
  );

  if (skillsPath === undefined || !(await isDirectory(skillsPath))) {
    return;
  }

  await validateSkills(context, skillsPath);
}

export async function validateSkills(
  context: ValidationContext,
  skillsPath: string,
): Promise<void> {
  const entries = await readdir(skillsPath, { withFileTypes: true });
  const skillDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (skillDirs.length === 0) {
    error(context, "skills/non-empty", skillsPath, "Expected at least one skill directory.");
  }

  for (const skillName of skillDirs) {
    const skillPath = path.join(skillsPath, skillName);
    await validateSkill(context, skillName, skillPath);
  }
}

export async function validateSkill(
  context: ValidationContext,
  skillName: string,
  skillPath: string,
): Promise<void> {
  const skillFilePath = path.join(skillPath, "SKILL.md");
  if (!(await pathExists(skillFilePath))) {
    error(context, "agentskills/missing-file", skillFilePath, "Missing SKILL.md.");
    return;
  }

  await validateSkillFrontmatter(context, skillName, skillFilePath);
  const metadataPath = path.join(skillPath, "agents", "openai.yaml");
  if (!(await pathExists(metadataPath))) {
    error(
      context,
      "repo/openai-metadata-required",
      metadataPath,
      "Missing agents/openai.yaml. This Codex plugin repository requires OpenAI skill metadata for every skill.",
    );
    return;
  }

  await validateOpenAiMetadata(context, skillName, metadataPath);
}
