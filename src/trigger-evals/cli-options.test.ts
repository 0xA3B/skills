import { describe, expect, it } from "vitest";

import { HelpRequested, parseTriggerEvalCliOptions } from "./cli-options.js";

describe("parseTriggerEvalCliOptions", () => {
  it("accepts just a skill path", () => {
    expect(parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar"])).toStrictEqual({
      skillPath: "codex_plugins/foo/skills/bar",
    });
  });

  it("parses all optional flags", () => {
    expect(
      parseTriggerEvalCliOptions([
        "codex_plugins/foo/skills/bar",
        "--fixture",
        "custom.yaml",
        "--case",
        "case-a",
        "--model",
        "gpt-5",
        "--timeout-ms",
        "5000",
        "--concurrency",
        "4",
        "--codex-home",
        "/tmp/codex",
        "--force",
      ]),
    ).toStrictEqual({
      skillPath: "codex_plugins/foo/skills/bar",
      fixturePath: "custom.yaml",
      caseId: "case-a",
      model: "gpt-5",
      timeoutMs: 5000,
      concurrency: 4,
      sourceCodexHome: "/tmp/codex",
      force: true,
    });
  });

  it("ignores the package-manager argument separator", () => {
    expect(parseTriggerEvalCliOptions(["--", "codex_plugins/foo/skills/bar"])).toStrictEqual({
      skillPath: "codex_plugins/foo/skills/bar",
    });
  });

  it("throws when --fixture is missing its value", () => {
    expect(() => parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--fixture"])).toThrow(
      "Missing value for --fixture.",
    );
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--fixture="]),
    ).toThrow("Missing value for --fixture.");
  });

  it("rejects non-positive timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--timeout-ms", "0"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects non-numeric timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--timeout-ms", "abc"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects partially numeric timeouts", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--timeout-ms", "100ms"]),
    ).toThrow("--timeout-ms must be a positive integer.");
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--timeout-ms", "1.5"]),
    ).toThrow("--timeout-ms must be a positive integer.");
  });

  it("rejects invalid concurrency values", () => {
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--concurrency", "0"]),
    ).toThrow("--concurrency must be a positive integer.");
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--concurrency", "abc"]),
    ).toThrow("--concurrency must be a positive integer.");
  });

  it("rejects unknown options", () => {
    expect(() => parseTriggerEvalCliOptions(["codex_plugins/foo/skills/bar", "--verbose"])).toThrow(
      "Unknown option: --verbose",
    );
  });

  it("requires exactly one positional skill path", () => {
    expect(() => parseTriggerEvalCliOptions([])).toThrow("Usage: pnpm eval:trigger");
    expect(() =>
      parseTriggerEvalCliOptions(["codex_plugins/a/skills/b", "codex_plugins/c/skills/d"]),
    ).toThrow("Usage: pnpm eval:trigger");
  });

  it("signals help requests via HelpRequested", () => {
    expect(() => parseTriggerEvalCliOptions(["--help"])).toThrow(HelpRequested);
    expect(() => parseTriggerEvalCliOptions(["-h"])).toThrow(HelpRequested);
  });
});
