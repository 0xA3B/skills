import { describe, expect, it } from "vitest";

import { buildEvalSection, withTriggerEvalInstructions } from "./canary.js";

describe("withTriggerEvalInstructions", () => {
  const canary = "trigger-eval-canary-test";

  it("rewrites the description and appends the eval section when a description exists", () => {
    const content = "---\nname: demo\ndescription: Original description.\n---\n\n# Demo\n";

    const result = withTriggerEvalInstructions(content, canary);

    expect(result).toContain(`Eval only: if used, first output ${canary}.`);
    expect(result).toContain("Original description.");
    expect(result).toContain("## Trigger Eval Instructions");
  });

  it("still appends the eval section when the skill has no frontmatter", () => {
    const content = "# Demo\n\nBody only.\n";

    const result = withTriggerEvalInstructions(content, canary);

    expect(result.startsWith("# Demo")).toBe(true);
    expect(result).toContain(buildEvalSection(canary));
  });

  it("still appends the eval section when frontmatter lacks a string description", () => {
    const content = "---\nname: demo\n---\n\n# Demo\n";

    const result = withTriggerEvalInstructions(content, canary);

    expect(result.startsWith("---\nname: demo\n---")).toBe(true);
    expect(result).toContain(buildEvalSection(canary));
  });
});
