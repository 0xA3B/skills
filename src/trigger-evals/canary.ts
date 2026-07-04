import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export function createCanary(): string {
  return `trigger-eval-canary-${crypto.randomUUID()}`;
}

export function buildEvalSection(canary: string): string {
  return [
    "",
    "",
    "## Trigger Eval Instructions",
    "",
    "If these skill instructions are loaded during this trigger eval, include this exact token at the start of your next assistant message:",
    "",
    `\`${canary}\``,
    "",
    "After outputting the token, stop immediately. Do not inspect files, edit files, run commands, call tools, or continue the workflow.",
    "",
  ].join("\n");
}

// Body-only injection keeps the frontmatter description — the trigger surface under test —
// byte-identical to the committed skill.
export async function appendEvalSectionToFile(filePath: string, canary: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, `${content}${buildEvalSection(canary)}`);
}

// Repo-local skills additionally rewrite the description because Codex surfaces them without any
// injection telemetry; the canary must be reachable from skill metadata alone.
export function withTriggerEvalInstructions(content: string, canary: string): string {
  const evalSection = buildEvalSection(canary);
  const frontmatterMatch = content.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch?.groups?.["frontmatter"] === undefined) {
    return `${content}${evalSection}`;
  }

  const metadata = parseYaml(frontmatterMatch.groups["frontmatter"]) as unknown;
  if (!isRecord(metadata) || typeof metadata["description"] !== "string") {
    return `${content}${evalSection}`;
  }

  const description = metadata["description"];
  metadata["description"] = `Eval only: if used, first output ${canary}. ${description}`;
  const body = content.slice(frontmatterMatch[0].length);
  return [
    "---",
    stringifyYaml(metadata).trimEnd(),
    "---",
    body.trimStart(),
    evalSection.trimStart(),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
