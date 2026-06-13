import { describe, expect, it } from "vitest";

import { parseCliOptions } from "./cli-options.js";

describe("CLI option parsing", () => {
  it("accepts the external validation flag", () => {
    expect(parseCliOptions(["--external"])).toStrictEqual({ externalValidationEnabled: true });
  });

  it("ignores the package-manager argument separator", () => {
    expect(parseCliOptions(["--", "--external"])).toStrictEqual({
      externalValidationEnabled: true,
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseCliOptions(["--verbose"])).toThrow("Unknown option: --verbose");
  });
});
