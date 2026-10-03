import { describe, expect, it } from "vitest";

import {
  HelpRequested,
  parseTriggerEvalCliOptions,
  usage,
} from "../../src/trigger-evals/cli-options.js";

describe("parseTriggerEvalCliOptions", () => {
  it("accepts --with-dependents on every selection mode", () => {
    expect(
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--with-dependents"]).withDependents,
    ).toBe(true);
    expect(
      parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "--with-dependents"]).withDependents,
    ).toBe(true);
    expect(parseTriggerEvalCliOptions(["--marketplace", "--with-dependents"]).withDependents).toBe(
      true,
    );
    expect(parseTriggerEvalCliOptions(["plugins/foo/skills/bar"])).not.toHaveProperty(
      "withDependents",
    );
  });

  it("accepts just a skill path", () => {
    expect(parseTriggerEvalCliOptions(["plugins/foo/skills/bar"])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
    });
  });

  it("parses all optional flags", () => {
    expect(
      parseTriggerEvalCliOptions([
        "plugins/foo/skills/bar",
        "--agent",
        "claude",
        "--fixture",
        "custom.yaml",
        "--case",
        "case-a",
        "--model",
        "gpt-5",
        "--effort",
        "high",
        "--timeout-ms",
        "5000",
        "--concurrency",
        "4",
        "--repeat",
        "5",
        "--codex-home",
        "/tmp/codex",
        "--claude-config-dir",
        "/tmp/claude-config",
        "--keep-runtime",
        "--force",
      ]),
    ).toStrictEqual({
      agents: ["claude"],
      selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
      fixturePath: "custom.yaml",
      caseIds: ["case-a"],
      model: "gpt-5",
      effort: "high",
      timeoutMs: 5000,
      concurrency: 4,
      repeat: 5,
      sourceCodexHome: "/tmp/codex",
      claudeConfigDir: "/tmp/claude-config",
      keepRuntime: true,
      force: true,
    });
  });

  it("expands --agent both into codex and claude runs", () => {
    expect(parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--agent", "both"])).toStrictEqual(
      {
        agents: ["codex", "claude"],
        selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
      },
    );
  });

  it("selects plugin suite mode with --plugin", () => {
    expect(
      parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "--agent", "both"]),
    ).toStrictEqual({
      agents: ["codex", "claude"],
      selection: { mode: "plugin", pluginPath: "plugins/foo" },
    });
  });

  it("selects marketplace suite mode with --marketplace", () => {
    expect(parseTriggerEvalCliOptions(["--marketplace"])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "marketplace", skillPaths: [] },
    });
  });

  it("accepts selected skill paths with --marketplace", () => {
    expect(
      parseTriggerEvalCliOptions([
        "--marketplace",
        "plugins/foo/skills/bar",
        "plugins/baz/skills/qux",
      ]),
    ).toStrictEqual({
      agents: ["codex"],
      selection: {
        mode: "marketplace",
        skillPaths: ["plugins/foo/skills/bar", "plugins/baz/skills/qux"],
      },
    });
  });

  it.each([
    ["--plugin with --marketplace", ["--plugin", "--marketplace", "plugins/foo"]],
    ["--seed with a skill path", ["--seed", "node-service", "plugins/foo/skills/bar"]],
    ["--seed with --plugin", ["--seed", "node-service", "--plugin", "plugins/foo"]],
    ["--seed with --marketplace", ["--seed", "node-service", "--marketplace"]],
  ])("rejects combining %s", (_combination, argv) => {
    expect(() => parseTriggerEvalCliOptions(argv)).toThrow(
      "Use one selection: a skill path, --plugin, --marketplace, or --seed.",
    );
  });

  // Spec (grill-me 1.1): `--seed <seed>` is a selection mode naming one workspace seed, given as a
  // bare name or a seed path under evals/seeds/.
  it.each([
    "node-service",
    "evals/seeds/node-service",
    "evals/seeds/node-service/",
    "./evals/seeds/node-service",
  ])("selects seed mode from --seed %s", (seedArgument) => {
    expect(parseTriggerEvalCliOptions(["--seed", seedArgument])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "seed", seedName: "node-service" },
    });
  });

  it.each([
    "Node_Service",
    "evals/node-service",
    "evals/seeds/node-service/src",
    "../node-service",
    // Indirect spellings name the seed only after path normalization, which --seed does not do.
    "other/../node-service",
    "evals/seeds/../seeds/node-service",
    "evals/seeds//node-service",
  ])("rejects --seed %s as not a seed", (seedArgument) => {
    expect(() => parseTriggerEvalCliOptions(["--seed", seedArgument])).toThrow(
      `--seed takes a kebab-case seed name or evals/seeds/<name>; received ${seedArgument}.`,
    );
  });

  it("takes one seed per run", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["--seed", "node-service", "--seed", "other-seed"]),
    ).toThrow("Pass one --seed per run.");
  });

  // Spec (grill-me 2.1): a seed selection has no selected skill for a routing assertion to name.
  it("rejects --with-dependents with --seed", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["--seed", "node-service", "--with-dependents"]),
    ).toThrow("--with-dependents needs selected skills; a --seed selection has none.");
  });

  it("requires a plugin path with --plugin", () => {
    expect(() => parseTriggerEvalCliOptions(["--plugin"])).toThrow(
      "Usage: pnpm eval:trigger -- --plugin plugins/<plugin> [options]",
    );
  });

  it("still rejects extra positionals in plugin mode", () => {
    expect(() => parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "plugins/bar"])).toThrow(
      "Usage: pnpm eval:trigger",
    );
  });

  it("rejects per-skill narrowing flags without exactly one target skill", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "--case", "case-a"]),
    ).toThrow(
      "--case requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.",
    );
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "--fixture", "custom.yaml"])).toThrow(
      "--fixture requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.",
    );
    expect(() =>
      parseTriggerEvalCliOptions([
        "--marketplace",
        "plugins/foo/skills/bar",
        "plugins/baz/skills/qux",
        "--case",
        "case-a",
      ]),
    ).toThrow(
      "--case requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.",
    );
    expect(() =>
      parseTriggerEvalCliOptions(["--seed", "node-service", "--case", "case-a"]),
    ).toThrow(
      "--case requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.",
    );
    expect(() =>
      parseTriggerEvalCliOptions(["--seed", "node-service", "--fixture", "custom.yaml"]),
    ).toThrow(
      "--fixture requires one target skill: pass a single skill path, or --marketplace with exactly one skill path.",
    );
  });

  it("accepts narrowing flags with a single-skill marketplace selection", () => {
    expect(
      parseTriggerEvalCliOptions([
        "--marketplace",
        "plugins/foo/skills/bar",
        "--case",
        "case-a",
        "--fixture",
        "custom.yaml",
      ]),
    ).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "marketplace", skillPaths: ["plugins/foo/skills/bar"] },
      caseIds: ["case-a"],
      fixturePath: "custom.yaml",
    });
  });

  it.each([
    ["a plugin", ["--plugin", "plugins/foo"]],
    ["the whole marketplace", ["--marketplace"]],
    ["a one-skill marketplace selection", ["--marketplace", "plugins/foo/skills/bar"]],
    ["a seed", ["--seed", "node-service"]],
  ])("rejects --force for %s", (_selection, argv) => {
    expect(() => parseTriggerEvalCliOptions([...argv, "--force"])).toThrow(
      "--force applies to single-skill runs, not --plugin, --marketplace, or --seed.",
    );
  });

  it("rejects unknown agents", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--agent", "gemini"]),
    ).toThrow('--agent must be "codex", "claude", or "both".');
  });

  it("ignores the package-manager argument separator", () => {
    expect(parseTriggerEvalCliOptions(["--", "plugins/foo/skills/bar"])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
    });
  });

  it("throws when --fixture is missing its value", () => {
    expect(() => parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--fixture"])).toThrow(
      "Missing value for --fixture.",
    );
    expect(() => parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--fixture="])).toThrow(
      "Missing value for --fixture.",
    );
  });

  it.each([
    ["--timeout-ms", "0"],
    ["--timeout-ms", "abc"],
    ["--timeout-ms", "100ms"],
    ["--timeout-ms", "1.5"],
    // Past Number.MAX_SAFE_INTEGER, so the digits would not survive the conversion.
    ["--timeout-ms", "9007199254740993"],
    ["--concurrency", "0"],
    ["--concurrency", "abc"],
    ["--repeat", "0"],
    ["--repeat", "2.5"],
  ])("rejects %s %s as not a positive integer", (flag, value) => {
    expect(() => parseTriggerEvalCliOptions(["plugins/foo/skills/bar", flag, value])).toThrow(
      `${flag} must be a positive integer.`,
    );
  });

  it("rejects unknown options", () => {
    expect(() => parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--verbose"])).toThrow(
      "Unknown option: --verbose",
    );
  });

  it("requires exactly one positional skill path", () => {
    expect(() => parseTriggerEvalCliOptions([])).toThrow("Usage: pnpm eval:trigger");
    expect(() => parseTriggerEvalCliOptions(["plugins/a/skills/b", "plugins/c/skills/d"])).toThrow(
      "Usage: pnpm eval:trigger",
    );
  });

  it("signals help requests via HelpRequested", () => {
    expect(() => parseTriggerEvalCliOptions(["--help"])).toThrow(HelpRequested);
    expect(() => parseTriggerEvalCliOptions(["-h"])).toThrow(HelpRequested);
  });
});

describe("usage", () => {
  // Every long flag the parser accepts except --help, which asks for this text. The parser keeps
  // its option table private, so the list is repeated here.
  it.each([
    "--agent",
    "--plugin",
    "--marketplace",
    "--seed",
    "--fixture",
    "--case",
    "--model",
    "--effort",
    "--timeout-ms",
    "--concurrency",
    "--repeat",
    "--codex-home",
    "--claude-config-dir",
    "--with-dependents",
    "--keep-runtime",
    "--force",
  ])("documents %s in the options list", (flag) => {
    expect(usage()).toMatch(new RegExp(`^  ${flag}\\b`, "m"));
  });
});
