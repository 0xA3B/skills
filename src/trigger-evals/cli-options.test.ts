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
      selection: { mode: "marketplace" },
    });
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

  it("rejects a path with --marketplace", () => {
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "plugins/foo"])).toThrow(
      "--marketplace runs every marketplace skill; do not pass a path.",
    );
  });

  it("rejects per-skill narrowing flags in suite modes", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["--plugin", "plugins/foo", "--case", "case-a"]),
    ).toThrow("--case applies to single-skill runs, not --plugin or --marketplace.");
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "--fixture", "custom.yaml"])).toThrow(
      "--fixture applies to single-skill runs, not --plugin or --marketplace.",
    );
    expect(() => parseTriggerEvalCliOptions(["--marketplace", "--force"])).toThrow(
      "--force applies to single-skill runs, not --plugin or --marketplace.",
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
