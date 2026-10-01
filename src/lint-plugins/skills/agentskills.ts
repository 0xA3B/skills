import { readFile } from "node:fs/promises";

import { parseSkillDocument } from "../../skills/index.js";
import { error, type ValidationContext } from "../diagnostics.js";
import {
  getOptionalBoolean,
  getOptionalObject,
  getOptionalString,
  getString,
  isObject,
} from "../schema.js";
import {
  AGENT_SKILL_COMPATIBILITY_MAX_LENGTH,
  AGENT_SKILL_DESCRIPTION_MAX_LENGTH,
  AGENT_SKILL_FRONTMATTER_KEYS,
  CLAUDE_SKILL_CONTEXT_VALUES,
  CLAUDE_SKILL_EFFORT_VALUES,
  CLAUDE_SKILL_FRONTMATTER_KEYS,
  CLAUDE_SKILL_LISTING_MAX_LENGTH,
  CLAUDE_SKILL_SHELL_VALUES,
} from "../specs.js";
import { errorMessage } from "../utils.js";

// Agent Skills recommends keeping SKILL.md under 500 lines and 5,000 tokens. The budgets fail the
// run with no per-skill opt-out: a skill over budget gets an instruction audit that shortens it.
const MAX_RECOMMENDED_BODY_LINES = 500;
const MAX_RECOMMENDED_BODY_TOKENS = 5_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const BODY_BUDGET_REMEDY = "Audit and shorten the instructions, or move detail to references/.";

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
  const document = parseSkillDocument(content);

  if (document.status === "missing-frontmatter") {
    error(context, "agentskills/frontmatter", skillFilePath, "Missing YAML frontmatter.");
    return EMPTY_SUMMARY;
  }

  if (document.body.trim().length === 0) {
    error(
      context,
      "agentskills/body",
      skillFilePath,
      "Expected Markdown body content after the YAML frontmatter.",
    );
  }

  validateRecommendedBodySize(context, skillFilePath, document.body);

  if (document.status === "invalid-yaml") {
    error(
      context,
      "parse/yaml",
      skillFilePath,
      `Unable to parse YAML frontmatter: ${errorMessage(document.error)}`,
      "/frontmatter",
    );
    return EMPTY_SUMMARY;
  }

  const parsed = document.frontmatter;
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
  // The spec only recommends a short license, so no length limit applies (#147).
  getOptionalString(context, parsed, "license", skillFilePath, "/frontmatter/license");
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

  if (description !== undefined && description.length > AGENT_SKILL_DESCRIPTION_MAX_LENGTH) {
    error(
      context,
      "agentskills/description-length",
      skillFilePath,
      `Frontmatter "description" is ${description.length} characters; the limit is ${AGENT_SKILL_DESCRIPTION_MAX_LENGTH}.`,
      "/frontmatter/description",
    );
  }

  if (compatibility !== undefined && compatibility.length > AGENT_SKILL_COMPATIBILITY_MAX_LENGTH) {
    error(
      context,
      "agentskills/compatibility-length",
      skillFilePath,
      `Frontmatter "compatibility" is ${compatibility.length} characters; the limit is ${AGENT_SKILL_COMPATIBILITY_MAX_LENGTH}.`,
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

  // House rule, not a spec rule: "arguments" stays a supported Claude Code key above, but skill
  // bodies in this repository stay agent-agnostic, so they handle arguments in prose.
  if (parsed["arguments"] !== undefined) {
    error(
      context,
      "repo/skill-arguments",
      skillFilePath,
      'Frontmatter "arguments" powers Claude-only $name substitution; skill bodies must stay agent-agnostic, so handle arguments in prose.',
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

  // Dead configuration: the text can never reach the model, so it misleads whoever edits it.
  if (whenToUse !== undefined && disableModelInvocation === true) {
    error(
      context,
      "claude-skill/when-to-use-hidden",
      skillFilePath,
      '"when_to_use" is never surfaced when "disable-model-invocation: true" removes the skill listing from context.',
      "/frontmatter/when_to_use",
    );
  }

  // Truncation silently cuts the trigger contract, so an over-long listing fails the run.
  const listingLength =
    whenToUse === undefined || description === undefined
      ? undefined
      : description.length + whenToUse.length;
  if (listingLength !== undefined && listingLength > CLAUDE_SKILL_LISTING_MAX_LENGTH) {
    error(
      context,
      "claude-skill/listing-length",
      skillFilePath,
      `Combined "description" and "when_to_use" are ${listingLength} characters; the limit is ${CLAUDE_SKILL_LISTING_MAX_LENGTH}, beyond which Claude Code truncates the skill listing.`,
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
    error(
      context,
      "agentskills/body-lines",
      skillFilePath,
      `SKILL.md body is ${bodyLineCount} lines; the limit is ${MAX_RECOMMENDED_BODY_LINES}. ${BODY_BUDGET_REMEDY}`,
    );
  }

  const estimatedTokens = Math.ceil(bodyForSize.length / ESTIMATED_CHARS_PER_TOKEN);
  if (estimatedTokens > MAX_RECOMMENDED_BODY_TOKENS) {
    error(
      context,
      "agentskills/body-tokens",
      skillFilePath,
      `SKILL.md body is an estimated ${estimatedTokens} tokens at ${ESTIMATED_CHARS_PER_TOKEN} characters per token; the limit is ${MAX_RECOMMENDED_BODY_TOKENS}. ${BODY_BUDGET_REMEDY}`,
    );
  }
}
