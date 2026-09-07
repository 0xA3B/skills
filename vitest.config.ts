import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace seeds carry their own node --test suites; they are staged into trigger-eval
    // workspaces, never run here.
    exclude: ["**/node_modules/**", "**/.git/**", "**/.local/**", "**/evals/seeds/**"],
  },
});
