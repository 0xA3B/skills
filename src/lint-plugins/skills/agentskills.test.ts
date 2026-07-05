import { describe, expect, it } from "vitest";

import {
  createTestContext,
  diagnosticByRule,
  diagnosticPointers,
  ruleIds,
  validSkillMarkdown,
  withTempRepo,
  writeText,
} from "../test-utils.js";
import { validateSkillFrontmatter } from "./agentskills.js";

describe("Agent Skills frontmatter validation", () => {
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

  it("accepts Claude Code invocation policy in SKILL.md frontmatter", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/manual/SKILL.md",
        validSkillMarkdown({
          body: "# Manual",
          frontmatter: {
            "disable-model-invocation": true,
            description: "Use when a test needs a manual-only skill fixture.",
            name: "manual",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      const summary = await validateSkillFrontmatter(context, "manual", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
      expect(summary.disableModelInvocation).toBe(true);
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
        "/frontmatter/effort",
        "/frontmatter/context",
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

  it("warns about when_to_use on manual-only skills and oversized listings", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/manual/SKILL.md",
        validSkillMarkdown({
          body: "# Manual",
          frontmatter: {
            description: `Use when a test needs a long listing. ${"d".repeat(980)}`,
            "disable-model-invocation": true,
            name: "manual",
            when_to_use: "w".repeat(600),
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "manual", skillPath);

      expect(ruleIds(context)).toStrictEqual(
        expect.arrayContaining(["claude-skill/when-to-use-hidden", "claude-skill/listing-length"]),
      );
      expect(diagnosticByRule(context, "claude-skill/when-to-use-hidden")?.severity).toBe(
        "warning",
      );
      expect(diagnosticByRule(context, "claude-skill/listing-length")?.severity).toBe("warning");
    });
  });

  it("warns when a skill declares Claude-only arguments substitution", async () => {
    await withTempRepo(async (repoRoot) => {
      const skillPath = await writeText(
        repoRoot,
        "skills/args/SKILL.md",
        validSkillMarkdown({
          body: "# Args",
          frontmatter: {
            arguments: "issue branch",
            description: "Use when a test needs the arguments policy warning.",
            name: "args",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "args", skillPath);

      expect(ruleIds(context)).toStrictEqual(["repo/skill-arguments"]);
      expect(diagnosticByRule(context, "repo/skill-arguments")?.severity).toBe("warning");
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
      expect(diagnosticByRule(context, "agentskills/name-format")?.severity).toBe("error");
      expect(diagnosticByRule(context, "agentskills/description-length")?.severity).toBe("error");
      expect(diagnosticByRule(context, "agentskills/compatibility-length")?.severity).toBe("error");
    });
  });

  it("warns when SKILL.md body exceeds recommended progressive-disclosure size", async () => {
    await withTempRepo(async (repoRoot) => {
      const body = Array.from({ length: 501 }, (_, index) => `${index}. ${"x".repeat(40)}`).join(
        "\n",
      );
      const skillPath = await writeText(
        repoRoot,
        "skills/large/SKILL.md",
        validSkillMarkdown({
          body,
          frontmatter: {
            description: "Use when a test needs an oversized body fixture.",
            name: "large",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "large", skillPath);

      expect(ruleIds(context)).toStrictEqual(["agentskills/body-lines", "agentskills/body-tokens"]);
      expect(diagnosticByRule(context, "agentskills/body-lines")?.severity).toBe("warning");
      expect(diagnosticByRule(context, "agentskills/body-tokens")?.severity).toBe("warning");
    });
  });

  it("does not warn at the recommended SKILL.md body limits", async () => {
    await withTempRepo(async (repoRoot) => {
      const body = Array.from({ length: 500 }, (_, index) => `${index}. ${"x".repeat(30)}`).join(
        "\n",
      );
      const skillPath = await writeText(
        repoRoot,
        "skills/limit/SKILL.md",
        validSkillMarkdown({
          body,
          frontmatter: {
            description: "Use when a test needs a body at the recommended limit.",
            name: "limit",
          },
        }),
      );
      const context = createTestContext(repoRoot);

      await validateSkillFrontmatter(context, "limit", skillPath);

      expect(context.diagnostics).toStrictEqual([]);
    });
  });
});
