import { symlink } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ValidationContext } from "../../src/lint-plugins/diagnostics.js";
import { validateInstructionFiles } from "../../src/lint-plugins/instruction-files.js";
import { lintPlugins } from "../../src/lint-plugins/runner.js";
import {
  createTestContext,
  diagnosticByRule,
  ruleIds,
  withTempRepo,
  writeText,
  writeValidPluginRepo,
} from "./test-utils.js";

const CODEX_DEFAULT_MAX_BYTES = 32_768;

function rootAgents(indexEntries: string[] = [], filler = ""): string {
  const index = indexEntries
    .map(
      (entry) =>
        `- Before reading or editing files under \`${entry}/\`, read \`${entry}/AGENTS.md\`.`,
    )
    .join("\n");
  return `# Project instructions

## Nested instructions

\`AGENTS.md\` is canonical; each sibling \`CLAUDE.md\` imports \`@AGENTS.md\`.

${index}

## Project conventions

- Use Conventional Commits.
${filler}`;
}

async function lintContext(repoRoot: string): Promise<ValidationContext> {
  const context = createTestContext(repoRoot);
  await validateInstructionFiles(context);
  return context;
}

async function lint(repoRoot: string): Promise<string[]> {
  return ruleIds(await lintContext(repoRoot));
}

async function writeRootAtSize(repoRoot: string, bytes: number): Promise<void> {
  const base = rootAgents();
  await writeText(repoRoot, "AGENTS.md", base + "x".repeat(bytes - Buffer.byteLength(base)));
}

describe("instruction files", () => {
  it("accepts an indexed nested AGENTS.md with sibling CLAUDE.md files", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents(["plugins"]));
      await writeText(repoRoot, "CLAUDE.md", "# Claude\n\n@AGENTS.md\n\n## Claude only\n");
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");
      await writeText(repoRoot, "plugins/CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual([]);
    });
  });

  it("checks nothing when the repository has no root AGENTS.md", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");

      expect(await lint(repoRoot)).toStrictEqual([]);
    });
  });

  it("rejects a root AGENTS.md over the Codex default byte limit", async () => {
    await withTempRepo(async (repoRoot) => {
      const atLimit = rootAgents();
      await writeText(
        repoRoot,
        "AGENTS.md",
        atLimit + "x".repeat(CODEX_DEFAULT_MAX_BYTES - Buffer.byteLength(atLimit)),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      expect(await lint(repoRoot)).toStrictEqual([]);

      await writeText(
        repoRoot,
        "AGENTS.md",
        atLimit + "x".repeat(CODEX_DEFAULT_MAX_BYTES - Buffer.byteLength(atLimit) + 1),
      );
      expect(await lint(repoRoot)).toStrictEqual(["instructions/root-size"]);
    });
  });

  it("counts bytes, not characters", async () => {
    await withTempRepo(async (repoRoot) => {
      const base = rootAgents();
      const characters = CODEX_DEFAULT_MAX_BYTES - base.length;
      // "é" is two bytes in UTF-8, so the file stays under the limit in characters only.
      await writeText(repoRoot, "AGENTS.md", base + "é".repeat(characters));
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/root-size"]);
    });
  });

  it.each(["project_doc_max_bytes = 1000", "project_doc_max_bytes = 1_000 # comment"])(
    "applies a lower .codex/config.toml limit: %s",
    async (line) => {
      await withTempRepo(async (repoRoot) => {
        await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
        await writeText(repoRoot, ".codex/config.toml", `model = "x"\n${line}\n`);

        await writeRootAtSize(repoRoot, 1000);
        expect(await lint(repoRoot)).toStrictEqual([]);

        await writeRootAtSize(repoRoot, 1001);
        expect(await lint(repoRoot)).toStrictEqual(["instructions/root-size"]);
      });
    },
  );

  it("ignores a higher .codex/config.toml limit, which only a trusted project applies", async () => {
    await withTempRepo(async (repoRoot) => {
      const base = rootAgents();
      await writeText(
        repoRoot,
        "AGENTS.md",
        base + "x".repeat(CODEX_DEFAULT_MAX_BYTES - Buffer.byteLength(base) + 1),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, ".codex/config.toml", "project_doc_max_bytes = 65536\n");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/root-size"]);
    });
  });

  it.each([
    ["a quoted key", '"project_doc_max_bytes" = 100\n', ["instructions/root-size"]],
    [
      "a key after a multi-line array",
      'a = [\n  ["x"]\n]\nproject_doc_max_bytes = 100\n',
      ["instructions/root-size"],
    ],
    [
      "a key after a multi-line string that names the key",
      'm = """\nproject_doc_max_bytes = 32768\n[x]\n"""\nproject_doc_max_bytes = 100\n',
      ["instructions/root-size"],
    ],
    ["a key inside a table", "[profiles.small]\nproject_doc_max_bytes = 100\n", []],
    ["a comment that names the key", "# project_doc_max_bytes = 100\n", []],
    ["a non-integer value", 'project_doc_max_bytes = "100"\n', ["instructions/codex-config"]],
    ["a negative value", "project_doc_max_bytes = -1\n", ["instructions/codex-config"]],
    ["invalid TOML", "project_doc_max_bytes =\n", ["instructions/codex-config"]],
  ])("reads .codex/config.toml as TOML: %s", async (_shape, config, expected) => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents());
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, ".codex/config.toml", config);

      expect(await lint(repoRoot)).toStrictEqual(expected);
    });
  });

  it("reports a .codex/config.toml that exists but cannot be read", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents());
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, ".codex/config.toml/placeholder", "");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/codex-config"]);
    });
  });

  it("ignores a fenced example inside the index", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(
        repoRoot,
        "AGENTS.md",
        rootAgents().replace(
          "## Project conventions",
          "```markdown\n- Before reading or editing files under `x/`, read `x/AGENTS.md`.\n```\n\n## Project conventions",
        ),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual([]);
    });
  });

  it("rejects a nested AGENTS.md missing from the root index", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents(["plugins"]));
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      for (const directory of ["plugins", "src/deep"]) {
        await writeText(repoRoot, `${directory}/AGENTS.md`, "# Nested\n");
        await writeText(repoRoot, `${directory}/CLAUDE.md`, "@AGENTS.md\n");
      }
      const context = await lintContext(repoRoot);

      expect(ruleIds(context)).toStrictEqual(["instructions/nested-index"]);
      expect(
        diagnosticByRule(context, "instructions/nested-index", {
          filePath: path.join(repoRoot, "src/deep/AGENTS.md"),
        }),
      ).toBeDefined();
    });
  });

  it("rejects an index entry whose nested AGENTS.md does not exist", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents(["plugins", "gone"]));
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");
      await writeText(repoRoot, "plugins/CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/nested-index"]);
    });
  });

  it("reads index entries only from the Nested instructions section", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(
        repoRoot,
        "AGENTS.md",
        rootAgents([], "- Rules for `plugins/` live in `plugins/AGENTS.md`.\n"),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");
      await writeText(repoRoot, "plugins/CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/nested-index"]);
    });
  });

  it("rejects an index entry that does not name its directory as a path predicate", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(
        repoRoot,
        "AGENTS.md",
        rootAgents([], "").replace(
          "## Project conventions",
          "- See `plugins/AGENTS.md` for context.\n\n## Project conventions",
        ),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");
      await writeText(repoRoot, "plugins/CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual(["instructions/nested-index"]);
    });
  });

  it("reads an index entry that wraps across lines", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(
        repoRoot,
        "AGENTS.md",
        rootAgents([], "").replace(
          "## Project conventions",
          "- Before reading or editing files under `src/` or `tests/`, read\n  `src/AGENTS.md`.\n\n## Project conventions",
        ),
      );
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "src/AGENTS.md", "# Source\n");
      await writeText(repoRoot, "src/CLAUDE.md", "@AGENTS.md\n");

      expect(await lint(repoRoot)).toStrictEqual([]);
    });
  });

  it("counts a nested AGENTS.md that is a file symlink", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents());
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "shared/real.md", "# Shared\n");
      await writeText(repoRoot, "p/CLAUDE.md", "@AGENTS.md\n");
      await symlink("../shared/real.md", path.join(repoRoot, "p/AGENTS.md"));

      expect(await lint(repoRoot)).toStrictEqual(["instructions/nested-index"]);
    });
  });

  it("does not count a dangling AGENTS.md symlink", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents(["p"]));
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "p/CLAUDE.md", "@AGENTS.md\n");
      await symlink("../missing.md", path.join(repoRoot, "p/AGENTS.md"));

      expect(await lint(repoRoot)).toStrictEqual(["instructions/nested-index"]);
    });
  });

  it("skips node_modules and dot-prefixed directories when finding nested files", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents());
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "node_modules/pkg/AGENTS.md", "# Vendored\n");
      await writeText(repoRoot, ".claude/worktrees/topic/AGENTS.md", "# Worktree copy\n");
      await writeText(repoRoot, ".local/eval/AGENTS.md", "# Scratch\n");
      await writeText(repoRoot, "packages/x/node_modules/pkg/AGENTS.md", "# Vendored\n");

      expect(await lint(repoRoot)).toStrictEqual([]);
    });
  });

  it.each([
    ["missing", undefined],
    ["not importing @AGENTS.md", "# Claude\n\nSee AGENTS.md.\n"],
    ["mentioning @AGENTS.md only inline", "# Claude\n\nImports `@AGENTS.md` elsewhere.\n"],
    ["importing only inside a fenced block", "# Claude\n\n```markdown\n@AGENTS.md\n```\n"],
    ["importing only inside an indented code block", "# Claude\n\n    @AGENTS.md\n"],
  ])("rejects a sibling CLAUDE.md that is %s", async (_state, claude) => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents(["plugins"]));
      await writeText(repoRoot, "CLAUDE.md", "@AGENTS.md\n");
      await writeText(repoRoot, "plugins/AGENTS.md", "# Plugins\n");
      if (claude !== undefined) {
        await writeText(repoRoot, "plugins/CLAUDE.md", claude);
      }
      const context = await lintContext(repoRoot);

      expect(ruleIds(context)).toStrictEqual(["instructions/claude-sibling"]);
      expect(
        diagnosticByRule(context, "instructions/claude-sibling", {
          filePath: path.join(repoRoot, "plugins/CLAUDE.md"),
        }),
      ).toBeDefined();
    });
  });

  it("checks the root CLAUDE.md as a sibling too", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeText(repoRoot, "AGENTS.md", rootAgents());

      expect(await lint(repoRoot)).toStrictEqual(["instructions/claude-sibling"]);
    });
  });

  it("runs as part of the plugin lint", async () => {
    await withTempRepo(async (repoRoot) => {
      await writeValidPluginRepo(repoRoot);
      await writeText(repoRoot, "AGENTS.md", rootAgents());

      const result = await lintPlugins({ repoRoot });

      expect(ruleIds(result.context)).toStrictEqual(["instructions/claude-sibling"]);
    });
  });
});
