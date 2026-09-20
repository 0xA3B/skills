import { describe, expect, it } from "vitest";

import { validateCliArgs } from "../../src/lint-plugins/cli-options.js";

describe("CLI option parsing", () => {
  it.each([{ args: [] }, { args: ["--"] }])(
    "accepts an invocation without options: $args",
    ({ args }) => {
      expect(() => validateCliArgs(args)).not.toThrow();
    },
  );

  it.each([{ args: ["--external"] }, { args: ["--", "--external"] }])(
    "rejects the removed external validation flag: $args",
    ({ args }) => {
      expect(() => validateCliArgs(args)).toThrow("Unknown option: --external");
    },
  );

  it("rejects unknown options", () => {
    expect(() => validateCliArgs(["--verbose"])).toThrow("Unknown option: --verbose");
  });
});
