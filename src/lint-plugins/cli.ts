#!/usr/bin/env node

import { validateCliArgs } from "./cli-options.js";
import { runCli } from "./runner.js";
import { errorMessage } from "./utils.js";

try {
  validateCliArgs(process.argv.slice(2));
  runCli();
} catch (caught: unknown) {
  console.error(errorMessage(caught));
  process.exitCode = 1;
}
