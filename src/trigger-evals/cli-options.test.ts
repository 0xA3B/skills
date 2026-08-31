import { describe, expect, it } from "vitest";

import { HelpRequested, parseTriggerEvalCliOptions } from "./cli-options.js";

describe("parseTriggerEvalCliOptions", () => {
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
        "--codex-home",
        "/tmp/codex",
        "--claude-config-dir",
        "/tmp/claude-config",
        "--force",
      ]),
    ).toStrictEqual({
      agents: ["claude"],
      selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
      fixturePath: "custom.yaml",
      caseId: "case-a",
      model: "gpt-5",
      effort: "high",
      timeoutMs: 5000,
      concurrency: 4,
      sourceCodexHome: "/tmp/codex",
      claudeConfigDir: "/tmp/claude-config",
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

  it("passes --isolated through for skill and plugin selections", () => {
    expect(parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--isolated"])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "skill", skillPath: "plugins/foo/skills/bar" },
      isolated: true,
    });
    expect(parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "--isolated"])).toStrictEqual({
      agents: ["codex"],
      selection: { mode: "plugin", pluginPath: "plugins/foo" },
      isolated: true,
    });
  });

  it("rejects --isolated with --marketplace", () => {
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "--isolated"])).toThrow(
      "--isolated stages only the target's own surface; drop --marketplace.",
    );
  });

  it("rejects combining --plugin with --marketplace", () => {
    expect(() => parseTriggerEvalCliOptions(["--plugin", "--marketplace", "plugins/foo"])).toThrow(
      "Use either --plugin or --marketplace, not both.",
    );
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
      caseId: "case-a",
      fixturePath: "custom.yaml",
    });
  });

  it("rejects --force in every suite mode", () => {
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "--force"])).toThrow(
      "--force applies to single-skill runs, not --plugin or --marketplace.",
    );
    expect(() =>
      parseTriggerEvalCliOptions(["--marketplace", "plugins/foo/skills/bar", "--force"]),
    ).toThrow("--force applies to single-skill runs, not --plugin or --marketplace.");
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

  it("rejects non-positive timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--timeout-ms", "0"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects non-numeric timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--timeout-ms", "abc"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects partially numeric timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--timeout-ms", "100ms"]),
    ).toThrow("--timeout-ms must be a positive integer.");
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--timeout-ms", "1.5"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects invalid concurrency values", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--concurrency", "0"]),
    ).toThrow("--concurrency must be a positive integer.");
    expect(() =>
      parseTriggerEvalCliOptions(["plugins/foo/skills/bar", "--concurrency", "abc"]),
    ).toThrow("--concurrency must be a positive integer.");
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
