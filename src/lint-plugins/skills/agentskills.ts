import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { error, type ValidationContext, warning } from "../diagnostics.js";
import { getOptionalString, getString, isObject } from "../schema.js";
import { AGENT_SKILL_FRONTMATTER_KEYS } from "../specs.js";
import { errorMessage } from "../utils.js";

const MAX_RECOMMENDED_BODY_LINES = 500;
const MAX_RECOMMENDED_BODY_TOKENS = 5_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;

export async function validateSkillFrontmatter(
  context: ValidationContext,
  skillName: string,
  skillFilePath: string,
): Promise<void> {
  const content = await readFile(skillFilePath, "utf8");
  const frontmatter = extractYamlFrontmatter(content);

  if (frontmatter === undefined) {
    error(context, "agentskills/frontmatter", skillFilePath, "Missing YAML frontmatter.");
    return;
  }

  if (frontmatter.body.trim().length === 0) {
    error(
      context,
      "agentskills/body",
      skillFilePath,
      "Expected Markdown body content after the YAML frontmatter.",
    );
  }

  validateRecommendedBodySize(context, skillFilePath, frontmatter.body);

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter.yaml);
  } catch (parseError) {
    error(
      context,
      "parse/yaml",
      skillFilePath,
      `Unable to parse YAML frontmatter: ${errorMessage(parseError)}`,
      "/frontmatter",
    );
    return;
  }

  if (!isObject(parsed)) {
    error(
      context,
      "agentskills/frontmatter",
      skillFilePath,
      "Expected frontmatter to be an object.",
    );
    return;
  }

  for (const key of Object.keys(parsed)) {
    if (key === "disable-model-invocation") {
      continue;
    }

    if (!AGENT_SKILL_FRONTMATTER_KEYS.has(key)) {
      error(
        context,
        "agentskills/frontmatter-key",
        skillFilePath,
        `Unsupported Agent Skills frontmatter key "${key}".`,
        `/frontmatter/${key}`,
      );
    }
  }

  const name = getString(context, parsed, "name", skillFilePath, "/frontmatter/name");
  const description = getString(
    context,
    parsed,
    "description",
    skillFilePath,
    "/frontmatter/description",
  );
  const license = getOptionalString(
    context,
    parsed,
    "license",
    skillFilePath,
    "/frontmatter/license",
  );
  const compatibility = getOptionalString(
    context,
    parsed,
    "compatibility",
    skillFilePath,
    "/frontmatter/compatibility",
  );
  getOptionalString(context, parsed, "allowed-tools", skillFilePath, "/frontmatter/allowed-tools");

  if (name !== undefined && name !== skillName) {
    error(
      context,
      "agentskills/name",
      skillFilePath,
      `Frontmatter name "${name}" does not match directory "${skillName}".`,
      "/frontmatter/name",
    );
  }

  if (name !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) {
    error(
      context,
      "agentskills/name-format",
      skillFilePath,
      'Frontmatter "name" must be 1-64 lowercase letters, numbers, or hyphens.',
      "/frontmatter/name",
    );
  }

  if (name !== undefined && name.includes("--")) {
    error(
      context,
      "agentskills/name-format",
      skillFilePath,
      'Frontmatter "name" must not contain consecutive hyphens.',
      "/frontmatter/name",
    );
  }

  if (description !== undefined && description.length > 1024) {
    error(
      context,
      "agentskills/description-length",
      skillFilePath,
      'Frontmatter "description" must be 1024 characters or fewer.',
      "/frontmatter/description",
    );
  }

  if (license !== undefined && license.length > 200) {
    warning(
      context,
      "repo/skill-license-length",
      skillFilePath,
      'Frontmatter "license" should be a short license name or file reference.',
      "/frontmatter/license",
    );
  }

  if (compatibility !== undefined && compatibility.length > 500) {
    error(
      context,
      "agentskills/compatibility-length",
      skillFilePath,
      'Frontmatter "compatibility" must be 500 characters or fewer.',
      "/frontmatter/compatibility",
    );
  }

  if (Object.hasOwn(parsed, "disable-model-invocation")) {
    error(
      context,
      "repo/unsupported-skill-key",
      skillFilePath,
      'Unsupported frontmatter key "disable-model-invocation"; use agents/openai.yaml policy.allow_implicit_invocation instead.',
      "/frontmatter/disable-model-invocation",
    );
  }

  const metadata = parsed["metadata"];
  if (metadata !== undefined) {
    if (!isObject(metadata)) {
      error(
        context,
        "agentskills/metadata",
        skillFilePath,
        'Expected frontmatter "metadata" to be an object when provided.',
        "/frontmatter/metadata",
      );
      return;
    }

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value !== "string") {
        error(
          context,
          "agentskills/metadata",
          skillFilePath,
          `Expected frontmatter "metadata.${key}" to be a string.`,
          `/frontmatter/metadata/${key}`,
        );
      }
    }
  }
}

function extractYamlFrontmatter(content: string): { yaml: string; body: string } | undefined {
  const lines = content.split(/\r\n|\n|\r/);
  if (lines[0] !== "---") {
    return undefined;
  }

  const closingLineIndex = lines.indexOf("---", 1);
  if (closingLineIndex === -1) {
    return undefined;
  }

  return {
    yaml: lines.slice(1, closingLineIndex).join("\n"),
    body: lines.slice(closingLineIndex + 1).join("\n"),
  };
}

function validateRecommendedBodySize(
  context: ValidationContext,
  skillFilePath: string,
  body: string,
): void {
  const bodyForSize = body.trimEnd();
  if (bodyForSize.length === 0) {
    return;
  }

  const bodyLineCount = bodyForSize.split(/\r\n|\r|\n/).length;
  if (bodyLineCount > MAX_RECOMMENDED_BODY_LINES) {
    warning(
      context,
      "agentskills/body-lines",
      skillFilePath,
      `SKILL.md body should stay under ${MAX_RECOMMENDED_BODY_LINES} lines; move detailed material to references/.`,
    );
  }

  const estimatedTokens = Math.ceil(bodyForSize.length / ESTIMATED_CHARS_PER_TOKEN);
  if (estimatedTokens > MAX_RECOMMENDED_BODY_TOKENS) {
    warning(
      context,
      "agentskills/body-tokens",
      skillFilePath,
      `SKILL.md body should stay under approximately ${MAX_RECOMMENDED_BODY_TOKENS} tokens; estimated ${estimatedTokens} tokens at ${ESTIMATED_CHARS_PER_TOKEN} chars/token.`,
    );
  }
}
