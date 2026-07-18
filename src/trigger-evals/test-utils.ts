import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type { CliRunResult } from "./exec.js";

// The canary rewrite re-stringifies the frontmatter, wrapping long lines, so description
// assertions must go through the parsed YAML instead of raw substrings.
export function frontmatterDescription(content: string): string {
  const match = content.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---/);
  const metadata = parseYaml(match?.groups?.["frontmatter"] ?? "") as { description?: unknown };
  return typeof metadata.description === "string" ? metadata.description : "";
}

export function agentMessageEvent(text: string): string {
  return `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })}\n`;
}

export function skillToolUseEvent(...skillLabels: string[]): string {
  return `${JSON.stringify({
    type: "assistant",
    message: {
      content: skillLabels.map((skillLabel) => ({
        type: "tool_use",
        name: "Skill",
        input: { command: skillLabel },
      })),
    },
  })}\n`;
}

export function buildCliRunResult(overrides: Partial<CliRunResult> = {}): CliRunResult {
  return {
    exitCode: 0,
    finalMessage: "",
    stdout: "",
    stderr: "",
    stdoutPath: "/tmp/stdout.jsonl",
    stderrPath: "/tmp/stderr.log",
    finalMessagePath: "/tmp/final.txt",
    endedBy: "completed",
    ...overrides,
  };
}

export type RepoFixtureOptions = {
  cases?: Array<{
    id: string;
    expect: "invoke" | "skip";
    prompt?: string;
    workspaceFiles?: Record<string, string>;
  }>;
  claudeOnly?: boolean;
  siblingSkills?: Array<{ name: string; manualOnly?: boolean }>;
  marketplace?: boolean;
};

export async function writeRepoFixture(options: RepoFixtureOptions = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const pluginPath = path.join(repoRoot, "plugins", "demo");
  const skillPath = path.join(pluginPath, "skills", "auto-skill");

  if (options.marketplace === true) {
    const otherSkillPath = path.join(repoRoot, "plugins", "other", "skills", "other-skill");
    await mkdir(path.join(otherSkillPath, "agents"), { recursive: true });
    await mkdir(path.join(repoRoot, "plugins", "other", ".codex-plugin"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "plugins", "other", ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "other", version: "2.0.0", skills: "./skills/" }),
    );
    await writeFile(
      path.join(otherSkillPath, "SKILL.md"),
      [
        "---",
        "name: other-skill",
        "description: Use when the user asks for the other plugin's skill.",
        "---",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(otherSkillPath, "agents", "openai.yaml"),
      "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
    );

    await mkdir(path.join(repoRoot, ".agents", "plugins"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
      JSON.stringify({
        name: "fixture-marketplace",
        plugins: [
          { name: "demo", source: { source: "local", path: "./plugins/demo" } },
          { name: "other", source: { source: "local", path: "./plugins/other" } },
        ],
      }),
    );
    await mkdir(path.join(repoRoot, ".claude-plugin"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".claude-plugin", "marketplace.json"),
      JSON.stringify({
        name: "fixture-marketplace",
        plugins: [
          { name: "demo", source: "./plugins/demo" },
          { name: "other", source: "./plugins/other" },
        ],
      }),
    );
  }

  for (const sibling of options.siblingSkills ?? []) {
    const siblingPath = path.join(pluginPath, "skills", sibling.name);
    await mkdir(path.join(siblingPath, "agents"), { recursive: true });
    await writeFile(
      path.join(siblingPath, "SKILL.md"),
      [
        "---",
        `name: ${sibling.name}`,
        "description: Use when the user asks for the sibling skill.",
        ...(sibling.manualOnly === true ? ["disable-model-invocation: true"] : []),
        "---",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(siblingPath, "agents", "openai.yaml"),
      `version: 1\npolicy:\n  allow_implicit_invocation: ${sibling.manualOnly === true ? "false" : "true"}\n`,
    );
  }

  await mkdir(path.join(skillPath, "evals"), { recursive: true });
  if (options.claudeOnly === true) {
    await mkdir(path.join(pluginPath, ".claude-plugin"), { recursive: true });
    await writeFile(
      path.join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "demo", version: "1.0.0", description: "Demo plugin" }),
    );
  } else {
    await mkdir(path.join(pluginPath, ".codex-plugin"), { recursive: true });
    await mkdir(path.join(skillPath, "agents"), { recursive: true });
    await writeFile(
      path.join(pluginPath, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "demo", version: "1.0.0", skills: "./skills/" }),
    );
    await writeFile(
      path.join(skillPath, "agents", "openai.yaml"),
      "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
    );
  }
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: auto-skill\n---\n");
  await writeFile(
    path.join(skillPath, "evals", "triggers.yaml"),
    [
      "version: 1",
      "cases:",
      ...fixtureCaseLines(
        options.cases ?? [
          { id: "invoke-case", expect: "invoke" },
          { id: "skip-case", expect: "skip" },
        ],
      ),
      "",
    ].join("\n"),
  );

  return repoRoot;
}

export async function writeRepoLocalSkillFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const skillPath = path.join(repoRoot, ".agents", "skills", "auto-skill");

  await mkdir(path.join(skillPath, "agents"), { recursive: true });
  await mkdir(path.join(skillPath, "evals"), { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    [
      "---",
      "name: auto-skill",
      "description: Use when the user asks to invoke this repo-local skill.",
      "---",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
  );
  await writeFile(
    path.join(skillPath, "evals", "triggers.yaml"),
    [
      "version: 1",
      "cases:",
      "  - id: repo-local-case",
      "    prompt: Invoke the skill.",
      "    expect: invoke",
      "  - id: skip-case",
      "    prompt: Do not invoke the skill.",
      "    expect: skip",
      "",
    ].join("\n"),
  );

  return repoRoot;
}

function fixtureCaseLines(
  cases: Array<{
    id: string;
    expect: "invoke" | "skip";
    prompt?: string;
    workspaceFiles?: Record<string, string>;
  }>,
): string[] {
  return cases.flatMap((testCase) => {
    const prompt =
      testCase.prompt ?? `${testCase.expect === "invoke" ? "Invoke" : "Do not invoke"} the skill.`;
    const lines = [
      `  - id: ${testCase.id}`,
      `    prompt: ${prompt}`,
      `    expect: ${testCase.expect}`,
    ];
    if (testCase.workspaceFiles !== undefined) {
      lines.push("    workspace_files:");
      for (const [filePath, content] of Object.entries(testCase.workspaceFiles)) {
        lines.push(`      ${filePath}: |`);
        lines.push(...content.split("\n").map((line) => `        ${line}`));
      }
    }
    return lines;
  });
}
