import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { error, type ValidationContext, warning } from "../diagnostics.js";
import {
  getOptionalBoolean,
  getOptionalObject,
  getOptionalString,
  getString,
  isObject,
} from "../schema.js";
import {
  AGENT_SKILL_FRONTMATTER_KEYS,
  CLAUDE_SKILL_CONTEXT_VALUES,
  CLAUDE_SKILL_EFFORT_VALUES,
  CLAUDE_SKILL_FRONTMATTER_KEYS,
  CLAUDE_SKILL_LISTING_MAX_LENGTH,
  CLAUDE_SKILL_SHELL_VALUES,
} from "../specs.js";
import { errorMessage } from "../utils.js";

const MAX_RECOMMENDED_BODY_LINES = 500;
const MAX_RECOMMENDED_BODY_TOKENS = 5_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;

export type SkillFrontmatterSummary = {
  disableModelInvocation: boolean | undefined;
};

const EMPTY_SUMMARY: SkillFrontmatterSummary = { disableModelInvocation: undefined };

export async function validateSkillFrontmatter(
  context: ValidationContext,
  skillName: string,
  skillFilePath: string,
): Promise<SkillFrontmatterSummary> {
  const content = await readFile(skillFilePath, "utf8");
  const frontmatter = extractYamlFrontmatter(content);

  if (frontmatter === undefined) {
    error(context, "agentskills/frontmatter", skillFilePath, "Missing YAML frontmatter.");
    return EMPTY_SUMMARY;
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
    return EMPTY_SUMMARY;
  }

  if (!isObject(parsed)) {
    error(
      context,
      "agentskills/frontmatter",
      skillFilePath,
      "Expected frontmatter to be an object.",
    );
    return EMPTY_SUMMARY;
  }

  for (const key of Object.keys(parsed)) {
    if (!AGENT_SKILL_FRONTMATTER_KEYS.has(key) && !CLAUDE_SKILL_FRONTMATTER_KEYS.has(key)) {
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

  const disableModelInvocation = getOptionalBoolean(
    context,
    parsed,
    "disable-model-invocation",
    skillFilePath,
    "/frontmatter/disable-model-invocation",
  );

  validateClaudeFrontmatter(context, parsed, skillFilePath, description, disableModelInvocation);

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
      return { disableModelInvocation };
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

  return { disableModelInvocation };
}

function validateClaudeFrontmatter(
  context: ValidationContext,
  parsed: Record<string, unknown>,
  skillFilePath: string,
  description: string | undefined,
  disableModelInvocation: boolean | undefined,
): void {
  const whenToUse = getOptionalString(
    context,
    parsed,
    "when_to_use",
    skillFilePath,
    "/frontmatter/when_to_use",
  );
  getOptionalString(context, parsed, "argument-hint", skillFilePath, "/frontmatter/argument-hint");
  getOptionalString(context, parsed, "model", skillFilePath, "/frontmatter/model");
  getOptionalObject(context, parsed, "hooks", skillFilePath, "/frontmatter/hooks");

  // Claude Code accepts YAML lists for these keys, but this repository keeps them as delimited
  // strings so the same frontmatter stays portable across Agent Skills consumers.
  getOptionalString(
    context,
    parsed,
    "disallowed-tools",
    skillFilePath,
    "/frontmatter/disallowed-tools",
  );
  getOptionalString(context, parsed, "paths", skillFilePath, "/frontmatter/paths");
  getOptionalString(context, parsed, "arguments", skillFilePath, "/frontmatter/arguments");

  if (parsed["arguments"] !== undefined) {
    warning(
      context,
      "repo/skill-arguments",
      skillFilePath,
      'Frontmatter "arguments" powers Claude-only $name substitution; skill bodies must stay agent-agnostic, so prefer prose argument handling.',
      "/frontmatter/arguments",
    );
  }

  validateEnumValue(context, parsed, "effort", CLAUDE_SKILL_EFFORT_VALUES, skillFilePath);
  const skillContext = validateEnumValue(
    context,
    parsed,
    "context",
    CLAUDE_SKILL_CONTEXT_VALUES,
    skillFilePath,
  );
  validateEnumValue(context, parsed, "shell", CLAUDE_SKILL_SHELL_VALUES, skillFilePath);

  const agent = getOptionalString(context, parsed, "agent", skillFilePath, "/frontmatter/agent");
  if (agent !== undefined && skillContext !== "fork") {
    error(
      context,
      "claude-skill/agent-requires-fork",
      skillFilePath,
      'Frontmatter "agent" only applies when "context: fork" is set.',
      "/frontmatter/agent",
    );
  }

  const userInvocable = getOptionalBoolean(
    context,
    parsed,
    "user-invocable",
    skillFilePath,
    "/frontmatter/user-invocable",
  );
  if (disableModelInvocation === true && userInvocable === false) {
    error(
      context,
      "claude-skill/uninvocable",
      skillFilePath,
      'Setting both "disable-model-invocation: true" and "user-invocable: false" leaves the skill with no way to be invoked.',
      "/frontmatter/user-invocable",
    );
  }

  if (whenToUse !== undefined && disableModelInvocation === true) {
    warning(
      context,
      "claude-skill/when-to-use-hidden",
      skillFilePath,
      '"when_to_use" is never surfaced when "disable-model-invocation: true" removes the skill listing from context.',
      "/frontmatter/when_to_use",
    );
  }

  if (
    whenToUse !== undefined &&
    description !== undefined &&
    description.length + whenToUse.length > CLAUDE_SKILL_LISTING_MAX_LENGTH
  ) {
    warning(
      context,
      "claude-skill/listing-length",
      skillFilePath,
      `Combined "description" and "when_to_use" exceed ${CLAUDE_SKILL_LISTING_MAX_LENGTH} characters; Claude Code truncates the skill listing beyond that.`,
      "/frontmatter/when_to_use",
    );
  }
}

function validateEnumValue(
  context: ValidationContext,
  parsed: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<string>,
  skillFilePath: string,
): string | undefined {
  const value = getOptionalString(context, parsed, key, skillFilePath, `/frontmatter/${key}`);
  if (value !== undefined && !allowed.has(value)) {
    error(
      context,
      "claude-skill/enum",
      skillFilePath,
      `Frontmatter "${key}" must be one of: ${[...allowed].join(", ")}.`,
      `/frontmatter/${key}`,
    );
    return undefined;
  }
  return value;
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
