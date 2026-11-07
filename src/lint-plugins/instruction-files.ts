import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseToml } from "smol-toml";

import { error, type ValidationContext } from "./diagnostics.js";
import { isFile } from "./files.js";
import { errorMessage } from "./utils.js";

// Codex's default `project_doc_max_bytes`. Codex cuts the AGENTS.md files it loads at this budget
// without telling the model, so an overrun never shows in review. A project's
// `.codex/config.toml` can only lower the limit here: Codex applies that file only in a trusted
// project, so an untrusted session still reads the default.
const CODEX_DEFAULT_MAX_BYTES = 32_768;
const INDEX_HEADING = "## Nested instructions";
const CODEX_CONFIG = path.join(".codex", "config.toml");
const INDEX_ENTRY = /`(?<entry>[^`\s]+\/AGENTS\.md)`/g;

// Codex loads only the root AGENTS.md when a session starts at the repository root, and reaches a
// nested AGENTS.md only through the root file's index; Claude Code loads a nested CLAUDE.md, not a
// nested AGENTS.md. A repository without a root AGENTS.md has nothing to check.
export async function validateInstructionFiles(context: ValidationContext): Promise<void> {
  const rootPath = path.join(context.repoRoot, "AGENTS.md");
  if (!(await isFile(rootPath))) {
    return;
  }
  const root = await readFile(rootPath);
  const limit = await rootByteLimit(context);
  if (root.byteLength > limit) {
    error(
      context,
      "instructions/root-size",
      rootPath,
      `Expected the root AGENTS.md to be at most ${limit} bytes, the Codex project_doc_max_bytes limit, but it has ${root.byteLength}. Move material to a nested AGENTS.md or a disclosed reference.`,
    );
  }

  const nested = await findNestedAgentsFiles(context.repoRoot);
  const { entries: indexed, unpredicated } = indexEntries(root.toString("utf8"));
  for (const relativePath of unpredicated) {
    error(
      context,
      "instructions/nested-index",
      rootPath,
      `Expected the "${INDEX_HEADING}" entry for \`${relativePath}\` to name its directory \`${path.posix.dirname(relativePath)}/\` as a path predicate, such as "Before reading or editing files under \`${path.posix.dirname(relativePath)}/\`, read \`${relativePath}\`."`,
    );
  }
  for (const relativePath of nested) {
    if (!indexed.has(relativePath)) {
      error(
        context,
        "instructions/nested-index",
        path.join(context.repoRoot, relativePath),
        `Expected the root AGENTS.md "${INDEX_HEADING}" section to list \`${relativePath}\` with a path predicate; Codex reads a nested AGENTS.md only through that list.`,
      );
    }
  }
  for (const relativePath of indexed) {
    if (!nested.includes(relativePath)) {
      error(
        context,
        "instructions/nested-index",
        rootPath,
        `Expected \`${relativePath}\`, listed under "${INDEX_HEADING}", to exist.`,
      );
    }
  }

  for (const relativePath of ["AGENTS.md", ...nested]) {
    await validateClaudeSibling(context, path.dirname(relativePath));
  }
}

async function rootByteLimit(context: ValidationContext): Promise<number> {
  const configPath = path.join(context.repoRoot, CODEX_CONFIG);
  let config: string;
  try {
    config = await readFile(configPath, "utf8");
  } catch (readError) {
    // Only a missing file means no project limit; any other failure, such as a directory or a
    // permission error, would otherwise hide a lower limit.
    if ((readError as NodeJS.ErrnoException).code !== "ENOENT") {
      error(
        context,
        "instructions/codex-config",
        configPath,
        `Unable to read the Codex config: ${errorMessage(readError)}`,
      );
    }
    return CODEX_DEFAULT_MAX_BYTES;
  }
  let value: unknown;
  try {
    value = parseToml(config)["project_doc_max_bytes"];
  } catch (parseError) {
    error(
      context,
      "instructions/codex-config",
      configPath,
      `Unable to parse TOML: ${errorMessage(parseError)}`,
    );
    return CODEX_DEFAULT_MAX_BYTES;
  }
  if (value === undefined) {
    return CODEX_DEFAULT_MAX_BYTES;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    error(
      context,
      "instructions/codex-config",
      configPath,
      `Expected project_doc_max_bytes to be a non-negative integer, but it is ${JSON.stringify(value)}.`,
    );
    return CODEX_DEFAULT_MAX_BYTES;
  }
  return Math.min(value, CODEX_DEFAULT_MAX_BYTES);
}

const FENCE = /^ {0,3}(?<fence>`{3,}|~{3,})/u;

// The lines of a Markdown document outside fenced code blocks, where Claude Code skips imports and
// an example index entry is not an entry.
function linesOutsideFences(markdown: string): string[] {
  const lines: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const marker = FENCE.exec(line)?.groups?.["fence"];
    if (fence === undefined && marker !== undefined) {
      fence = marker;
    } else if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}

type IndexEntries = { entries: Set<string>; unpredicated: string[] };

// An index entry is a list item in the Nested instructions section that names a nested AGENTS.md
// path. The item must also name the file's directory, such as `plugins/`, as its path predicate.
function indexEntries(root: string): IndexEntries {
  const items: string[] = [];
  let inIndex = false;
  for (const line of linesOutsideFences(root)) {
    if (line.startsWith("## ")) {
      inIndex = line.trimEnd() === INDEX_HEADING;
      continue;
    }
    if (!inIndex) {
      continue;
    }
    if (line.startsWith("- ")) {
      items.push(line);
    } else if (/^\s+\S/u.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  const entries = new Set<string>();
  const unpredicated: string[] = [];
  for (const item of items) {
    for (const match of item.matchAll(INDEX_ENTRY)) {
      const entry = match.groups?.["entry"] ?? "";
      entries.add(entry);
      if (!item.includes(`\`${path.posix.dirname(entry)}/\``)) {
        unpredicated.push(entry);
      }
    }
  }
  return { entries, unpredicated };
}

// Sorted repository-relative paths, with `/` separators, of every AGENTS.md below the root. The
// walk skips node_modules and dot-prefixed directories, such as harness worktrees under `.claude/`,
// and follows no directory symlinks, though it counts an AGENTS.md file symlink, as the root check
// does; gitignore is not consulted because lint results must not depend on git
// configuration.
async function findNestedAgentsFiles(repoRoot: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(relativeDirectory: string): Promise<void> {
    const entries = await readdir(path.join(repoRoot, relativeDirectory), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          await walk(relativePath);
        }
      } else if (
        entry.name === "AGENTS.md" &&
        relativeDirectory !== "" &&
        (entry.isFile() ||
          (entry.isSymbolicLink() && (await isFile(path.join(repoRoot, relativePath)))))
      ) {
        found.push(relativePath);
      }
    }
  }
  await walk("");
  return found.sort();
}

async function validateClaudeSibling(
  context: ValidationContext,
  relativeDirectory: string,
): Promise<void> {
  const claudePath = path.join(context.repoRoot, relativeDirectory, "CLAUDE.md");
  // An import is its own line outside a code block; four leading spaces would make it an indented
  // code block, which Claude Code skips too.
  const imports =
    (await isFile(claudePath)) &&
    linesOutsideFences(await readFile(claudePath, "utf8")).some((line) =>
      /^ {0,3}@AGENTS\.md\s*$/u.test(line),
    );
  if (!imports) {
    error(
      context,
      "instructions/claude-sibling",
      claudePath,
      "Expected a CLAUDE.md beside this AGENTS.md that imports it with an `@AGENTS.md` line; Claude Code loads CLAUDE.md, not AGENTS.md.",
    );
  }
}
