import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prepareCodexHome } from "./codex-home.js";

describe("prepareCodexHome", () => {
  it("builds an eval config when the source config is missing", async () => {
    const sourceCodexHome = await mkdtemp(path.join(os.tmpdir(), "source-codex-home-"));
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "eval-codex-home-"));
    await writeFile(path.join(sourceCodexHome, "auth.json"), "{}");

    await prepareCodexHome({
      codexHome,
      sourceCodexHome,
      workspacePath: "/tmp/workspace",
      model: "gpt-5.6-luna",
      effort: "medium",
      marketplaceName: "trigger-eval",
      pluginName: "demo-plugin",
    });

    await expect(readFile(path.join(codexHome, "auth.json"), "utf8")).resolves.toBe("{}");
    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('[marketplaces."trigger-eval"]');
    expect(config).toContain('model = "gpt-5.6-luna"');
    expect(config).toContain('model_reasoning_effort = "medium"');
  });

  it("pins the eval model instead of inheriting it from the source config", async () => {
    const sourceCodexHome = await mkdtemp(path.join(os.tmpdir(), "source-codex-home-"));
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "eval-codex-home-"));
    await mkdir(sourceCodexHome, { recursive: true });
    await writeFile(path.join(sourceCodexHome, "auth.json"), "{}");
    await writeFile(
      path.join(sourceCodexHome, "config.toml"),
      [
        'model = "gpt-5.5"',
        'model_reasoning_effort = "xhigh"',
        'web_search = "enabled"',
        'unknown_setting = "ignored"',
        "",
        "[features]",
        "plugins = false",
        "",
      ].join("\n"),
    );

    await prepareCodexHome({
      codexHome,
      sourceCodexHome,
      workspacePath: "/tmp/workspace",
      model: "gpt-5.6-luna",
      effort: "medium",
      marketplaceName: "trigger-eval",
      pluginName: "demo-plugin",
    });

    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('model = "gpt-5.6-luna"');
    expect(config).toContain('model_reasoning_effort = "medium"');
    expect(config).not.toContain('model = "gpt-5.5"');
    expect(config).not.toContain('model_reasoning_effort = "xhigh"');
    expect(config).toContain('web_search = "enabled"');
    expect(config).not.toContain("unknown_setting");
    expect(config).toContain("plugins = true");
  });

  it("omits marketplace config when evaluating repo-local skills", async () => {
    const sourceCodexHome = await mkdtemp(path.join(os.tmpdir(), "source-codex-home-"));
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "eval-codex-home-"));
    await writeFile(path.join(sourceCodexHome, "auth.json"), "{}");

    await prepareCodexHome({
      codexHome,
      sourceCodexHome,
      workspacePath: "/tmp/workspace",
      model: "gpt-5.6-luna",
      effort: "medium",
    });

    const config = await readFile(path.join(codexHome, "config.toml"), "utf8");
    expect(config).toContain('[projects."/tmp/workspace"]');
    expect(config).not.toContain("[marketplaces.");
    expect(config).not.toContain("[plugins.");
  });
});
