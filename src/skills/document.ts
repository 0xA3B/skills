import { parse as parseYaml } from "yaml";

export type SkillDocument =
  | { status: "missing-frontmatter" }
  | { status: "invalid-yaml"; body: string; error: unknown }
  | { status: "parsed"; body: string; frontmatter: unknown };

// Only an opening YAML block is frontmatter. Normalize supported line endings before splitting
// the body; callers own object-shape validation, invocation policy, and diagnostic presentation.
export function parseSkillDocument(content: string): SkillDocument {
  const lines = content.split(/\r\n|\n|\r/);
  const closingLine = lines.indexOf("---", 1);
  if (lines[0] !== "---" || closingLine === -1) {
    return { status: "missing-frontmatter" };
  }

  const body = lines.slice(closingLine + 1).join("\n");
  try {
    const frontmatter: unknown = parseYaml(lines.slice(1, closingLine).join("\n"));
    return { status: "parsed", body, frontmatter };
  } catch (error) {
    return { status: "invalid-yaml", body, error };
  }
}
