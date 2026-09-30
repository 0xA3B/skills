import { describe, expect, it } from "vitest";

import { validateSkillFrontmatter } from "../../../src/lint-plugins/skills/agentskills.js";
import {
  createTestContext,
  diagnosticByRule,
  diagnosticPointers,
  ruleIds,
  validSkillMarkdown,
  withTempRepo,
  writeText,
} from "../test-utils.js";

describe("Agent Skills frontmatter validation", () => {
  it.each(["\n", "\r\n", "\r"])(
    "reads manual-only frontmatter with %j line endings",
    async (newline) => {
      await withTempRepo(async (repoRoot) => {
        const skillPath = await writeText(
          repoRoot,
          "hello/SKILL.md",
          [
            "---",
            "name: hello",
            "description: A sample skill",
            "disable-model-invocation: true",
            "---",
            "# Hello",
          ].join(newline),
        );
        const context = createTestContext(repoRoot);

        const summary = await validateSkillFrontmatter(context, "hello", skillPath);

        expect(summary.disableModelInvocation).toBe(true);
        expect(context.diagnostics).toStrictEqual([]);
      });
    },
  );

  it("reports malformed YAML while still checking the document body", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(repoRoot, "hello/SKILL.md", "---\nname: [unclosed\n---\n");
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "hello", skillPath);

      expect(ruleIds(context)).toStrictEqual(["agentskills/body", "parse/yaml"]);
    });
  });

  it("accepts a spec-shaped SKILL.md", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/hello/SKILL.md",
        validSkillMarkdown({
          body: "# Hello\n\nFollow the fixture workflow.",
          frontmatter: {
            "allowed-tools": "Bash",
            compatibility: "Codex",
            description: "Use when a test needs a valid skill.",
            license: "MIT",
            metadata: { source: "fixture" },
            name: "hello",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "hello", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("reports official spec field and body problems by rule ID", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/Bad--Name/SKILL.md",
        validSkillMarkdown({
          body: "",
          frontmatter: {
            description: "Use when a test needs an invalid skill.",
            metadata: { source: { nested: "value" } },
            name: "Bad--Name",
            unknown: "value",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "Bad--Name", skillPath);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "agentskills/body",
          "agentskills/frontmatter-key",
          "agentskills/name-format",
          "agentskills/metadata",
        ]),
      );
      expect(diagnosticPointers(context, "agentskills/frontmatter-key")).toContain(
        "/frontmatter/unknown",
      );
    });
  });

  it("extracts frontmatter from the opening yaml block only", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/fenced/SKILL.md",
        [
          "---",
          "name: fenced",
          "description: Use when a test includes a thematic break.",
          "---",
          "# Fenced",
          "",
          "The body may include another standalone delimiter.",
          "",
          "---",
          "",
        ].join("\n"),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "fenced", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("requires disable-model-invocation to be a boolean", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/manual/SKILL.md",
        validSkillMarkdown({
          body: "# Manual",
          frontmatter: {
            "disable-model-invocation": "yes",
            description: "Use when a test needs an invalid policy value.",
            name: "manual",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      const summary = await validateSkillFrontmatter(context, "manual", skillPath);

      expect(ruleIds(context)).toStrictEqual(["schema/boolean"]);
      expect(summary.disableModelInvocation).toBeUndefined();
    });
  });

  it("accepts the recognized Claude Code frontmatter keys", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/claude/SKILL.md",
        validSkillMarkdown({
          body: "# Claude",
          frontmatter: {
            agent: "Explore",
            "argument-hint": "[target] [format]",
            context: "fork",
            description: "Use when a test needs the Claude frontmatter surface.",
            "disallowed-tools": "AskUserQuestion",
            effort: "high",
            hooks: { PostToolUse: [] },
            model: "sonnet",
            name: "claude",
            paths: "plugins/**",
            shell: "bash",
            "user-invocable": true,
            when_to_use: "Trigger phrases for the Claude listing.",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "claude", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("reports invalid Claude frontmatter enum values and list-typed keys", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/claude/SKILL.md",
        validSkillMarkdown({
          body: "# Claude",
          frontmatter: {
            context: "subagent",
            description: "Use when a test needs invalid Claude frontmatter.",
            "disallowed-tools": ["Edit", "Write"],
            effort: "ultra",
            name: "claude",
            paths: ["plugins/**"],
            shell: "fish",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "claude", skillPath);

      expect(diagnosticPointers(context, "claude-skill/enum")).toStrictEqual([
        "/frontmatter/context",
        "/frontmatter/effort",
        "/frontmatter/shell",
      ]);
      expect(diagnosticPointers(context, "schema/string")).toStrictEqual(
        expect.arrayContaining(["/frontmatter/disallowed-tools", "/frontmatter/paths"]),
      );
    });
  });

  it("rejects an uninvocable skill and agent without fork", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/hidden/SKILL.md",
        validSkillMarkdown({
          body: "# Hidden",
          frontmatter: {
            agent: "Explore",
            description: "Use when a test needs conflicting invocation policy.",
            "disable-model-invocation": true,
            name: "hidden",
            "user-invocable": false,
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "hidden", skillPath);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining(["claude-skill/uninvocable", "claude-skill/agent-requires-fork"]),
      );
    });
  });

  it("reports when_to_use on manual-only skills", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/manual/SKILL.md",
        validSkillMarkdown({
          body: "# Manual",
          frontmatter: {
            description: "Use when a test needs a hidden when_to_use.",
            "disable-model-invocation": true,
            name: "manual",
            when_to_use: "Also use when nothing lists the skill.",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "manual", skillPath);

      expect(ruleIds(context)).toStrictEqual(["claude-skill/when-to-use-hidden"]);
    });
  });

  // Claude Code truncates the combined description and when_to_use listing at 1,536 characters.
  it("reports the combined listing length and its limit", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/listed/SKILL.md",
        validSkillMarkdown({
          body: "# Listed",
          frontmatter: {
            description: "d".repeat(1000),
            name: "listed",
            when_to_use: "w".repeat(537),
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "listed", skillPath);

      expect(ruleIds(context)).toStrictEqual(["claude-skill/listing-length"]);
      expect(diagnosticByRule(context, "claude-skill/listing-length")?.message).toBe(
        'Combined "description" and "when_to_use" are 1537 characters; the limit is 1536, beyond which Claude Code truncates the skill listing.',
      );
    });
  });

  // The Agent Skills spec only recommends a short license value, so any length passes.
  it("accepts a long license value", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/licensed/SKILL.md",
        validSkillMarkdown({
          body: "# Licensed",
          frontmatter: {
            description: "Use when a test needs a long license.",
            license: "l".repeat(201),
            name: "licensed",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "licensed", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });

  it("reports a skill that declares Claude-only arguments substitution", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/args/SKILL.md",
        validSkillMarkdown({
          body: "# Args",
          frontmatter: {
            arguments: "issue branch",
            description: "Use when a test needs the arguments house rule.",
            name: "args",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "args", skillPath);

      expect(ruleIds(context)).toStrictEqual(["repo/skill-arguments"]);
    });
  });

  it("reports frontmatter character limits from the official spec", async () => {
    await withTempRepo(async (repoRoot) => {
      const longName = `a${"a".repeat(64)}`;
      const skillPath = await writeText(
        repoRoot,
        `skills/${longName}/SKILL.md`,
        validSkillMarkdown({
          body: "# Limits",
          frontmatter: {
            compatibility: "c".repeat(501),
            description: "d".repeat(1025),
            name: longName,
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, longName, skillPath);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining([
          "agentskills/name-format",
          "agentskills/description-length",
          "agentskills/compatibility-length",
        ]),
      );
      expect(diagnosticByRule(context, "agentskills/description-length")?.message).toBe(
        'Frontmatter "description" is 1025 characters; the limit is 1024.',
      );
      expect(diagnosticByRule(context, "agentskills/compatibility-length")?.message).toBe(
        'Frontmatter "compatibility" is 501 characters; the limit is 500.',
      );
    });
  });

  it("reports excess lines even when the body stays below the token limit", async () => {
    const context = await lintBody("x\n".repeat(500) + "x"); // 501 lines, 1001 characters.

    expect(ruleIds(context)).toStrictEqual(["agentskills/body-lines"]);
    expect(diagnosticByRule(context, "agentskills/body-lines")?.message).toBe(
      "SKILL.md body is 501 lines; the limit is 500. Audit and shorten the instructions, or move detail to references/.",
    );
  });

  it("reports excess tokens even when the body stays below the line limit", async () => {
    const context = await lintBody("x".repeat(20_001)); // One line, one character over 5000 tokens.

    expect(ruleIds(context)).toStrictEqual(["agentskills/body-tokens"]);
    expect(diagnosticByRule(context, "agentskills/body-tokens")?.message).toBe(
      "SKILL.md body is an estimated 5001 tokens at 4 characters per token; the limit is 5000. Audit and shorten the instructions, or move detail to references/.",
    );
  });

  it("reports both body budgets when the body exceeds both limits", async () => {
    const context = await lintBody("x\n".repeat(500) + "x".repeat(19_001)); // 501 lines, 20001 characters.

    expect(ruleIds(context)).toStrictEqual(["agentskills/body-lines", "agentskills/body-tokens"]);
  });

  it("passes at exactly 500 lines and 5000 estimated tokens", async () => {
    const context = await lintBody("x\n".repeat(499) + "x".repeat(19_002)); // 500 lines, 20000 characters.

    expect(context.diagnostics).toStrictEqual([]);
  });
});

async function lintBody(body: string) {
  return withTempRepo(async (repoRoot) => {
    const skillPath = await writeText(repoRoot, "hello/SKILL.md", validSkillMarkdown({ body }));
    const context = createTestContext(repoRoot);
    await validateSkillFrontmatter(context, "hello", skillPath);
    return context;
  });
}
