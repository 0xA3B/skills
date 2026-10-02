import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

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
