import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type Agent, resolveSkill } from "../../src/skills/index.js";
import type { TriggerCase } from "../../src/trigger-evals/fixtures/index.js";
import {
  type CliRunResult,
  DEFAULT_EVAL_EFFORT,
  DEFAULT_EVAL_MODELS,
  type LaneRunOptions,
} from "../../src/trigger-evals/lanes/index.js";
import { createRuntimeResources } from "../../src/trigger-evals/runtime.js";

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// A trigger case whose prompt follows its expectation, as writeRepoFixture's cases do.
export function triggerCase(
  id: string,
  expect: TriggerCase["expect"],
  extra: Partial<TriggerCase> = {},
): TriggerCase {
  return {
    id,
    prompt: expect === "invoke" ? "Invoke the skill." : "Do not invoke the skill.",
    expect,
    ...extra,
  };
}

// The options the runner hands a lane's prepareRun, with the agent's default model and effort.
export async function makeLaneRunOptions(
  agent: Agent,
  repoRoot: string,
  skillPath: string,
  overrides: Partial<LaneRunOptions> = {},
): Promise<LaneRunOptions> {
  return {
    runDir: await mkdtemp(path.join(os.tmpdir(), `${agent}-lane-run-`)),
    target: resolveSkill(repoRoot, skillPath),
    model: DEFAULT_EVAL_MODELS[agent],
    effort: DEFAULT_EVAL_EFFORT,
    runtime: createRuntimeResources(),
    ...overrides,
  };
}

export function agentMessageEvent(text: string): string {
  return `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })}\n`;
}

export function commandExecutionEvent(
  command: string,
  outcome: { status?: string; exitCode?: number; output?: string } = {},
): string {
  return JSON.stringify({
    type: "item.completed",
    item: {
      type: "command_execution",
      command,
      ...(outcome.status === undefined ? {} : { status: outcome.status }),
      ...(outcome.exitCode === undefined ? {} : { exit_code: outcome.exitCode }),
      ...(outcome.output === undefined ? {} : { aggregated_output: outcome.output }),
    },
  });
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

// One case of a trigger fixture written by triggerFixtureYaml. The prompt defaults to one that
// follows the expectation.
export type FixtureCase = {
  id: string;
  expect: "invoke" | "skip";
  prompt?: string;
  invokeInstead?: string;
  workspaceFiles?: Record<string, string>;
};

export type RepoFixtureOptions = {
  cases?: FixtureCase[];
  claudeOnly?: boolean;
  portableVersion?: string;
  siblingSkills?: Array<{ name: string; manualOnly?: boolean }>;
  marketplace?: boolean;
};

export async function writeRepoFixture(options: RepoFixtureOptions = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const pluginPath = path.join(repoRoot, "plugins", "demo");
  const skillPath = path.join(pluginPath, "skills", "auto-skill");

  if (options.marketplace === true) {
    await writeOtherPlugin(repoRoot);
    await writeMarketplaceCatalogs(repoRoot, {
      codex: ["demo", "other"],
      claude: ["demo", "other"],
    });
  }

  for (const sibling of options.siblingSkills ?? []) {
    await writeSkillFiles(path.join(pluginPath, "skills", sibling.name), {
      description: "Use when the user asks for the sibling skill.",
      manualOnly: sibling.manualOnly === true,
    });
  }

  await mkdir(path.join(skillPath, "evals"), { recursive: true });
  if (options.claudeOnly === true) {
    await mkdir(path.join(pluginPath, ".claude-plugin"), { recursive: true });
    await writeFile(
      path.join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "demo", version: "1.0.0", description: "Demo plugin" }),
    );
  } else {
    await mkdir(path.join(skillPath, "agents"), { recursive: true });
    await writeFile(
      path.join(pluginPath, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "demo",
        version: options.portableVersion ?? "1.0.0",
        extensions: { "com.openai": {} },
      }),
    );
    await mkdir(path.join(pluginPath, ".claude-plugin"), { recursive: true });
    await writeFile(
      path.join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "demo", version: "1.0.0", description: "Demo plugin" }),
    );
    await writeFile(
      path.join(skillPath, "agents", "openai.yaml"),
      "version: 1\npolicy:\n  allow_implicit_invocation: true\n",
    );
  }
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: auto-skill\n---\n");
  await writeFile(
    path.join(skillPath, "evals", "triggers.yaml"),
    triggerFixtureYaml(options.cases),
  );

  return repoRoot;
}

// A minimal workspace seed under evals/seeds/<name> in a fixture repository.
export async function writeSeedFixture(repoRoot: string, seedName: string): Promise<void> {
  const seedPath = path.join(repoRoot, "evals", "seeds", seedName);
  await mkdir(path.join(seedPath, "src"), { recursive: true });
  await writeFile(path.join(seedPath, "package.json"), '{ "name": "seed" }\n');
  await writeFile(path.join(seedPath, "src", "index.js"), "export const seed = true;\n");
}

export type RepoLocalSkillFixtureOptions = {
  // Adds the "other" plugin and both marketplace catalogs listing it, so default staging has a
  // catalog to read.
  marketplace?: boolean;
  // Sibling repo-local skills under .agents/skills; manual-only siblings declare
  // disable-model-invocation in their frontmatter, the policy surface the harness reads.
  siblingSkills?: Array<{ name: string; manualOnly?: boolean }>;
};

export async function writeRepoLocalSkillFixture(
  options: RepoLocalSkillFixtureOptions = {},
): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "trigger-runner-"));
  const skillPath = path.join(repoRoot, ".agents", "skills", "auto-skill");

  if (options.marketplace === true) {
    await writeOtherPlugin(repoRoot);
    await writeMarketplaceCatalogs(repoRoot, { codex: ["other"], claude: ["other"] });
  }
  for (const sibling of options.siblingSkills ?? []) {
    await writeSkillFiles(path.join(repoRoot, ".agents", "skills", sibling.name), {
      description: "Use when the user asks for the sibling repo-local skill.",
      manualOnly: sibling.manualOnly === true,
    });
  }

  await writeSkillFiles(skillPath, {
    description: "Use when the user asks to invoke this repo-local skill.",
    fixture: triggerFixtureYaml([
      { id: "repo-local-case", expect: "invoke" },
      { id: "skip-case", expect: "skip" },
    ]),
  });

  return repoRoot;
}

async function writeOtherPlugin(repoRoot: string): Promise<void> {
  const pluginPath = path.join(repoRoot, "plugins", "other");
  await mkdir(pluginPath, { recursive: true });
  await writeFile(
    path.join(pluginPath, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "other",
      version: "2.0.0",
      extensions: { "com.openai": {} },
    }),
  );
  await writeSkillFiles(path.join(pluginPath, "skills", "other-skill"), {
    description: "Use when the user asks for the other plugin's skill.",
  });
}

export type SkillFilesOptions = {
  // Defaults to one naming the skill.
  description?: string;
  // Declares the skill manual-only on both agents: disable-model-invocation in SKILL.md and
  // allow_implicit_invocation: false in agents/openai.yaml.
  manualOnly?: boolean;
  // The evals/triggers.yaml content; the skill has no trigger fixture when omitted.
  fixture?: string;
};

// A skill directory named after the skill: SKILL.md, agents/openai.yaml, and an optional trigger
// fixture. Rewriting an existing skill replaces its SKILL.md and policy and keeps its fixture.
export async function writeSkillFiles(
  skillPath: string,
  options: SkillFilesOptions = {},
): Promise<void> {
  const name = path.basename(skillPath);
  await mkdir(path.join(skillPath, "agents"), { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${options.description ?? `Use when the user asks for ${name}.`}`,
      ...(options.manualOnly === true ? ["disable-model-invocation: true"] : []),
      "---",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(skillPath, "agents", "openai.yaml"),
    `version: 1\npolicy:\n  allow_implicit_invocation: ${options.manualOnly === true ? "false" : "true"}\n`,
  );
  if (options.fixture !== undefined) {
    await mkdir(path.join(skillPath, "evals"), { recursive: true });
    await writeFile(path.join(skillPath, "evals", "triggers.yaml"), options.fixture);
  }
}

// Both marketplace catalogs, each listing its own plugins from plugins/<name>.
export async function writeMarketplaceCatalogs(
  repoRoot: string,
  catalogs: { codex: string[]; claude: string[] },
): Promise<void> {
  await mkdir(path.join(repoRoot, ".agents", "plugins"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
    JSON.stringify({
      name: "fixture-marketplace",
      plugins: catalogs.codex.map((pluginName) => ({
        name: pluginName,
        source: { source: "local", path: `./plugins/${pluginName}` },
      })),
    }),
  );
  await mkdir(path.join(repoRoot, ".claude-plugin"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "fixture-marketplace",
      plugins: catalogs.claude.map((pluginName) => ({
        name: pluginName,
        source: `./plugins/${pluginName}`,
      })),
    }),
  );
}

// A schema-valid trigger fixture; the default holds one invoke case and one skip case.
export function triggerFixtureYaml(
  cases: FixtureCase[] = [
    { id: "invoke-case", expect: "invoke" },
    { id: "skip-case", expect: "skip" },
  ],
): string {
  const lines = cases.flatMap((testCase) => {
    const prompt =
      testCase.prompt ?? `${testCase.expect === "invoke" ? "Invoke" : "Do not invoke"} the skill.`;
    const caseLines = [
      `  - id: ${testCase.id}`,
      `    prompt: ${prompt}`,
      `    expect: ${testCase.expect}`,
    ];
    if (testCase.invokeInstead !== undefined) {
      caseLines.push(`    invoke-instead: ${testCase.invokeInstead}`);
    }
    if (testCase.workspaceFiles !== undefined) {
      caseLines.push("    workspace_files:");
      for (const [filePath, content] of Object.entries(testCase.workspaceFiles)) {
        caseLines.push(`      ${filePath}: |`);
        caseLines.push(...content.split("\n").map((line) => `        ${line}`));
      }
    }
    return caseLines;
  });
  return ["version: 1", "cases:", ...lines, ""].join("\n");
}
