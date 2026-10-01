import { describe, expect, it } from "vitest";

import { nextVersions, shippedChangesByPlugin } from "../../src/plugin-versions/policy.js";

describe("nextVersions", () => {
  // Semantic Versioning 2.0.0: a minor bump resets patch to 0; a major bump resets minor and patch.
  it("returns the next patch, minor, and major versions", () => {
    expect(nextVersions("1.2.3")).toStrictEqual(["1.2.4", "1.3.0", "2.0.0"]);
    expect(nextVersions("2.10.9")).toStrictEqual(["2.10.10", "2.11.0", "3.0.0"]);
  });

  // 2^53 + 1 is the first integer a JavaScript number cannot represent.
  it("increments components beyond the safe integer range exactly", () => {
    expect(nextVersions("9007199254740992.9007199254740992.9007199254740992")).toStrictEqual([
      "9007199254740992.9007199254740992.9007199254740993",
      "9007199254740992.9007199254740993.0",
      "9007199254740993.0.0",
    ]);
  });

  it.each(["1.0", "1.0.0-rc.1", "01.0.0", "1.0.0 ", "v1.0.0"])(
    "returns no versions for %j, which is not x.y.z",
    (version) => {
      expect(nextVersions(version)).toStrictEqual([]);
    },
  );
});

describe("shippedChangesByPlugin", () => {
  it("groups shipped paths by plugin, relative to the plugin directory", () => {
    expect(
      shippedChangesByPlugin([
        "plugins/alpha/README.md",
        "plugins/alpha/skills/hello/SKILL.md",
        "plugins/beta/plugin.json",
      ]),
    ).toStrictEqual(
      new Map([
        ["alpha", ["README.md", "skills/hello/SKILL.md"]],
        ["beta", ["plugin.json"]],
      ]),
    );
  });

  // Shipped content (AGENTS.md terminology): every file under plugins/<plugin>/ except trigger
  // fixtures under skills/<skill>/evals/.
  it("excludes trigger fixtures under skills/<skill>/evals/", () => {
    expect(
      shippedChangesByPlugin([
        "plugins/alpha/skills/hello/evals/triggers.yaml",
        "plugins/alpha/skills/hello/evals/cases/extra.yaml",
      ]),
    ).toStrictEqual(new Map());
  });

  it("counts evals directories outside skills/<skill>/ as shipped", () => {
    expect(
      shippedChangesByPlugin([
        "plugins/alpha/evals/notes.md",
        "plugins/alpha/scripts/tool/evals/case.md",
        "plugins/alpha/skills/hello/references/evals/guide.md",
      ]),
    ).toStrictEqual(
      new Map([
        [
          "alpha",
          [
            "evals/notes.md",
            "scripts/tool/evals/case.md",
            "skills/hello/references/evals/guide.md",
          ],
        ],
      ]),
    );
  });

  it("ignores files directly under plugins/ and paths outside plugins/", () => {
    expect(
      shippedChangesByPlugin(["plugins/AGENTS.md", "plugins/CLAUDE.md", "src/plugins/alpha/x.ts"]),
    ).toStrictEqual(new Map());
  });
});
