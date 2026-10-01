#!/usr/bin/env node

import { runPluginVersionCheck } from "./runner.js";

process.exitCode = await runPluginVersionCheck(process.argv.slice(2), {
  cwd: process.cwd(),
  log: console.log,
  error: console.error,
});
