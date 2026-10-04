import path from "node:path";

import { type ParseEntry, parse as parseShell } from "shell-quote";

// A staged skill whose invocation the Codex lane attributes: the target and every implicitly
// invokable staged skill. Manual-only skills cannot fire implicitly, so a read of one is not
// watched.
export type InvocableSkill = {
  skillLabel: string;
  // Undefined for a repo-local skill.
  pluginName?: string;
  skillName: string;
};

// What one command did with the staged skill files it names. A load puts a skill body into the
// agent's context from its first line, the way Codex loads a skill: it has no skill tool, so an
// implicit invocation is always a shell read. An inspection names the file without loading it as
// instructions. Anything else is unclassified, because it could be either.
export type SkillFileAccesses = {
  // Labels of loaded skills, in command order, each once.
  loads: string[];
  // The command segments that named a skill file in a form neither list covers.
  unclassified: string[];
  // Labels in loads whose every load may have been skipped even when the command exits 0, such
  // as `false && cat SKILL.md; true`.
  conditionalLoads: string[];
  // The label the command's first segment after any `cd` loads, when that segment names exactly
  // one skill file. That segment always runs and prints first, so it is the only load the start
  // of a failed command's output can be tied to.
  leadingLoad?: string;
};

// The classifier accepts only shell forms whose effect it can read exactly, and reports every other
// form that names a skill file as unclassified, so a new shell construct yields an error verdict
// instead of a guess.

// Commands that print the file from its first line. sed is a load only for a range that starts at
// line 1; see classifySed.
const LOAD_COMMANDS = new Set(["cat", "head", "nl"]);
// Commands that name a skill file without loading its body: metadata reads and existence tests.
const INSPECT_COMMANDS = new Set(["ls", "stat", "wc", "test", "["]);
// Per tool, the search flags that take a value and select patterns or files, and the other flags a
// search may use and still inspect. A search reads matching lines to answer a question, the
// read-to-inspect case (#196), so it inspects when every flag is listed; an unlisted flag, such as
// a context flag or `--passthru`, can print the body around the matches.
const SEARCH_FLAGS: Record<
  "rg" | "grep",
  { values: ReadonlySet<string>; other: ReadonlySet<string> }
> = {
  rg: {
    values: new Set(
      "-e --regexp -g --glob --iglob -t --type -T --type-not -m --max-count -d --max-depth".split(
        " ",
      ),
    ),
    other: new Set(
      "-l --files-with-matches --files-without-match -c --count --count-matches -q --quiet --files -i --ignore-case -S --smart-case -s --case-sensitive -F --fixed-strings -w --word-regexp -x --line-regexp -n --line-number -N --no-line-number -H --with-filename -I --no-filename --hidden -. --no-ignore -u -L --follow -U --multiline -P --pcre2".split(
        " ",
      ),
    ),
  },
  grep: {
    values: new Set("-e --regexp --include --exclude --exclude-dir -m --max-count".split(" ")),
    other: new Set(
      "-l -L --files-with-matches --files-without-match -c --count -q --quiet --silent -i -y --ignore-case -F --fixed-strings -E --extended-regexp -G --basic-regexp -P --perl-regexp -w --word-regexp -x --line-regexp -n --line-number -H --with-filename -h --no-filename -r -R --recursive --dereference-recursive -s --no-messages -I".split(
        " ",
      ),
    ),
  },
};
// A sed script of numeric ranges printed under -n, such as `1,240p` or `88,102p;124,134p`. The
// second address may also be `$` or a pattern, as in `0,/^## Steps/p`.
const SED_RANGES = /^\d+(?:,(?:\d+|\$|\/[^/]*\/))?p(?:;\d+(?:,(?:\d+|\$|\/[^/]*\/))?p)*$/;
// Per git subcommand, the flags that print only names, status, metadata, or this run's changes,
// matched by the part before any `=`; any other flag or subcommand, such as `-p` or `git show`,
// can print a body. ls-files never prints file content, so it takes any flag.
const GIT_INSPECT_FLAGS: Record<string, ReadonlySet<string> | "any"> = {
  "ls-files": "any",
  status: new Set(
    "-s --short -b --branch --porcelain -u --untracked-files --ignored --no-renames".split(" "),
  ),
  log: new Set(
    "--oneline --stat --shortstat --numstat --name-only --name-status --format --pretty -n --max-count --since --until --author --grep --date --decorate --no-decorate --abbrev-commit --follow --all --graph --reverse --no-merges".split(
      " ",
    ),
  ),
  // diff also needs every positional after `--`, so it compares the work tree or the index with
  // the commit the case started from, not two revisions.
  diff: new Set(
    "--stat --shortstat --numstat --name-only --name-status --quiet --exit-code --cached --staged --no-color".split(
      " ",
    ),
  ),
};
// find actions that run a command on each match, such as `-exec cat {} +`.
const FIND_RUN_ACTIONS = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
// Commands that pass a list of names through without running anything on it.
const NAME_FILTERS = new Set(["sort", "uniq", "head", "tail", "wc", "cut", "tr", "nl", "cat"]);
// Reserved words, which in command position open a compound command whose body may run zero times,
// run later, or never run.
const CONTROL_WORDS = new Set(
  "! { } [[ ]] case coproc do done elif else esac fi for function if in select then time until while".split(
    " ",
  ),
);
// Builtins that end or replace the shell before later commands run, also when run through
// `builtin` or `command`.
const SHELL_EXITS = new Set(["exec", "exit", "logout", "return"]);
// The operators that join simple commands in an accepted form. Every other control operator, such
// as `||`, `&`, or a subshell's parentheses, makes the command unclassified.
const JOIN_OPERATORS = new Set(["&&", ";", "|"]);
// Output redirections; an input redirection (`<`) passes its file to the command like an argument.
const REDIRECT_OPERATORS = new Set([">", ">>", ">&", "<&", ">|"]);

// Matches a path to a staged copy of one skill's SKILL.md: under a plugin cache
// (`<plugin>/<version>/skills/<skill>/SKILL.md`), the deployment copy
// (`plugins/<plugin>/skills/<skill>/SKILL.md`), or a repo-local staging (`.agents/skills/<skill>/
// SKILL.md`). The caller supplies the left boundary.
function skillFilePathSource(pluginName: string | undefined, skillName: string): string {
  return String.raw`${skillDirectorySource(pluginName, skillName)}/SKILL\.md`;
}

function skillDirectorySource(pluginName: string | undefined, skillName: string): string {
  const prefix =
    pluginName === undefined
      ? String.raw`\.agents/`
      : String.raw`${escapeRegExp(pluginName)}/(?:[^/]+/)?`;
  return String.raw`${prefix}skills/${escapeRegExp(skillName)}`;
}

// The directories that hold a staged skill file: the skill's own directory, the skills directory
// above it, and the plugin root (`<plugin>/<version>` in a cache, `plugins/<plugin>`) or, for a
// repo-local skill, `.agents`.
function skillContainerSource(skill: InvocableSkill): string {
  const root =
    skill.pluginName === undefined
      ? String.raw`\.agents`
      : String.raw`(?:plugins/${escapeRegExp(skill.pluginName)}|${escapeRegExp(skill.pluginName)}/\d[^/]*)`;
  return String.raw`(?:${skillDirectorySource(skill.pluginName, skill.skillName)}|skills|${root})`;
}

// Whether a command can reach a staged skill file: it mentions SKILL, a directory that holds a
// staged skill file (see skillContainerSource), or an expansion under a skills directory, such as
// `skills/*/SKILL.md`. A command that reaches one only through a further ancestor, such as
// `rg '^' .` or `find <cache root> -exec cat {} +`, is outside what the classifier sees.
function touchesSkills(command: string, skills: readonly InvocableSkill[]): boolean {
  return (
    command.includes("SKILL") ||
    /skills\/[\w./-]*[*?[{$]/.test(command) ||
    skills.some((skill) =>
      new RegExp(String.raw`(?:^|[^\w.-])${skillContainerSource(skill)}/?(?![\w./-])`).test(
        command,
      ),
    )
  );
}

// Matches a whole path that ends at a staged copy of the skill's SKILL.md.
function skillPathPattern(skill: InvocableSkill): RegExp {
  return new RegExp(String.raw`(?:^|/)${skillFilePathSource(skill.pluginName, skill.skillName)}$`);
}

// Matches a staged skill path anywhere inside a longer text, such as a script or an error line.
function skillMentionPattern(skill: InvocableSkill): RegExp {
  return new RegExp(
    String.raw`(?:^|[^\w.-])${skillFilePathSource(skill.pluginName, skill.skillName)}`,
  );
}

// The label of the staged skill a file at this path would be taken for: the matcher cannot tell
// a project file at a staged skill's path from the staged copy.
export function stagedSkillAtPath(
  filePath: string,
  skills: readonly InvocableSkill[],
): string | undefined {
  return skills.find((skill) => skillPathPattern(skill).test(filePath))?.skillLabel;
}

const FILE_ERROR = /no such file or directory|permission denied|is a directory|not a directory/i;

// What a command's output shows about one skill's body. Output cannot be attributed to the
// segment that printed it, so each fact says only what some segment did.
export type SkillOutputEvidence = {
  // The output starts with the skill's frontmatter, raw or numbered by `nl`, so the command's
  // first printing segment printed the body. File errors before it print no body, so they are
  // skipped, as when `cat AGENTS.md SKILL.md` finds no AGENTS.md (2026-10-04 add-skill
  // repo-local-skill-request attempt 2).
  leadingBody: boolean;
  // The skill's frontmatter name line appears somewhere, from a load or from an inspection.
  nameLine: boolean;
  // A file error names one of the skill's staged paths.
  fileError: boolean;
};

export function skillOutputEvidence(output: string, skill: InvocableSkill): SkillOutputEvidence {
  const nameLine = new RegExp(String.raw`^name:\s*["']?${escapeRegExp(skill.skillName)}["']?$`);
  const lines = output.split("\n").map((line) => line.replace(/^\s*\d+\t/, "").trimEnd());
  const bodyStart = lines.findIndex((line) => !FILE_ERROR.test(line));
  const frontmatterEnd = lines.indexOf("---", bodyStart + 1);
  // The error formats put the path before a colon (`cat: <path>: ...`) or at the line end (zsh).
  const errorPath = new RegExp(
    String.raw`(?:^|[^\w.-])${skillFilePathSource(skill.pluginName, skill.skillName)}(?::|$)`,
  );
  return {
    leadingBody:
      lines[bodyStart] === "---" &&
      lines
        .slice(bodyStart + 1, frontmatterEnd === -1 ? undefined : frontmatterEnd)
        .some((line) => nameLine.test(line)),
    nameLine: lines.some((line) => nameLine.test(line.trimStart())),
    fileError: lines.some((line) => errorPath.test(line) && FILE_ERROR.test(line)),
  };
}

// Classifies every staged skill file one command names. A command that cannot reach a skill file
// (see touchesSkills) is skipped whole. Otherwise the
// command must be an accepted form (see parseAccepted), or it is unclassified whole. In an
// accepted form, a `cd` followed by `&&` is resolved; Codex command items carry no working
// directory, so a bare SKILL.md without one is unresolved. A skill path inside another word, such
// as a script or an assignment, and a path the shell composes from a variable, a glob, or a brace
// expansion are unresolved too, and a `cd` into an expanded directory is unclassified whole. An
// inspection wins over an unresolved path; a load or any other
// verb leaves it unclassified.
export function classifySkillFileAccesses(
  command: string,
  skills: readonly InvocableSkill[],
): SkillFileAccesses {
  const loads: string[] = [];
  if (!touchesSkills(command, skills)) {
    return { loads, unclassified: [], conditionalLoads: [] };
  }
  const inner = unwrapShell(command);
  const accepted = parseAccepted(inner);
  if (typeof accepted === "string") {
    return { loads, unclassified: [`${inner} (${accepted})`], conditionalLoads: [] };
  }
  const segments = accepted;
  const patterns = skills.map((skill) => ({
    skillLabel: skill.skillLabel,
    path: skillPathPattern(skill),
    mention: skillMentionPattern(skill),
    // A directory that holds the skill file, which a recursive read reaches.
    directory: new RegExp(String.raw`(?:^|/)${skillContainerSource(skill)}/?$`),
  }));
  // Loads with at least one segment that runs whenever the command exits 0.
  const reachedLoads = new Set<string>();
  const unclassified: string[] = [];
  let cwd: string | undefined;
  let leadingLoad: string | undefined;
  const leadingIndex = segments.findIndex(({ words }) => splitVerb(words).verb !== "cd");
  for (const [segmentIndex, segment] of segments.entries()) {
    const { words } = segment;
    const { verb, verbIndex } = splitVerb(words);
    if (verb === "cd") {
      cwd = resolveFrom(cwd, words[verbIndex + 1] ?? "");
      continue;
    }
    const named = new Set<string>();
    let unresolved = false;
    for (const [index, word] of words.entries()) {
      const resolved = resolveFrom(cwd, word);
      const match =
        verb !== undefined && index > verbIndex
          ? patterns.find((pattern) => pattern.path.test(resolved))
          : undefined;
      if (match !== undefined) {
        named.add(match.skillLabel);
      } else if (
        resolved === "SKILL.md" ||
        (segment.expands[index] === true && couldExpandToSkillFile(word)) ||
        patterns.some(({ mention, directory }) => mention.test(word) || directory.test(resolved))
      ) {
        unresolved = true;
      }
    }
    if (named.size === 0 && !unresolved) {
      continue;
    }
    let kind = classifyOutput(segment);
    // A load piped into a filter reaches the agent only through that filter, so the filter decides.
    // An inspection's output is a list of names, which may pass only through a name filter.
    for (let next = segmentIndex + 1; kind !== "unclassified"; next += 1) {
      const downstream = segments[next];
      if (downstream?.piped !== true) {
        break;
      }
      if (kind === "load") {
        // Several files reach the filter as one stream, so its range cannot be tied to one file;
        // and a filter that names its own file prints that file instead of, or before, the body.
        const filtered = classifyOutput(downstream);
        kind =
          fileOperands(words) > 1 || (filtered === "load" && fileOperands(downstream.words) > 0)
            ? "unclassified"
            : filtered;
      } else if (!passesNames(downstream.words)) {
        kind = "unclassified";
      }
    }
    if (kind === "inspect") {
      continue;
    }
    if (kind === "unclassified" || unresolved) {
      unclassified.push(cwd === undefined ? words.join(" ") : `${words.join(" ")} (in ${cwd})`);
      continue;
    }
    if (segment.reach !== "unknown") {
      for (const skillLabel of named) {
        reachedLoads.add(skillLabel);
      }
    }
    if (segmentIndex === leadingIndex && named.size === 1) {
      [leadingLoad] = named;
    }
    for (const skillLabel of named) {
      if (!loads.includes(skillLabel)) {
        loads.push(skillLabel);
      }
    }
  }

  return {
    loads,
    unclassified,
    conditionalLoads: loads.filter((skillLabel) => !reachedLoads.has(skillLabel)),
    ...(leadingLoad === undefined ? {} : { leadingLoad }),
  };
}

function splitVerb(words: string[]): { verb: string | undefined; verbIndex: number } {
  const verbIndex = words.findIndex((word) => !isAssignment(word));
  return { verb: verbIndex === -1 ? undefined : words[verbIndex], verbIndex };
}

// A load whose standard output goes to a file never reaches the agent, or reaches it later through
// the copy, so it is unclassified.
function classifyOutput(segment: Segment): "load" | "inspect" | "unclassified" {
  const kind = classifySegment(segment.words);
  return kind === "load" && segment.stdoutRedirected ? "unclassified" : kind;
}

function classifySegment(words: string[]): "load" | "inspect" | "unclassified" {
  const { verb, verbIndex } = splitVerb(words);
  if (verb === undefined) {
    return "unclassified";
  }
  const args = words.slice(verbIndex + 1);
  const name = path.basename(verb);
  if (LOAD_COMMANDS.has(name)) {
    const printsBody =
      name === "head"
        ? headPrintsBody(args)
        : args.every((arg) => !arg.startsWith("--") || arg === "--");
    return printsBody ? "load" : "unclassified";
  }
  if (INSPECT_COMMANDS.has(name)) {
    return "inspect";
  }
  if (name === "rg" || name === "grep") {
    return knownSearch(name, args) ? "inspect" : "unclassified";
  }
  if (name === "sed") {
    return classifySed(args);
  }
  if (name === "git") {
    return classifyGit(args);
  }
  if (name === "find") {
    return args.some((arg) => FIND_RUN_ACTIONS.has(arg)) ? "unclassified" : "inspect";
  }
  return "unclassified";
}

// git inspects only through a listed subcommand whose every flag is listed for it (see
// GIT_INSPECT_FLAGS); a global option before the subcommand, such as `-C`, is unclassified.
function classifyGit(args: string[]): "inspect" | "unclassified" {
  const [subcommand = "", ...rest] = args;
  const flags = GIT_INSPECT_FLAGS[subcommand];
  if (flags === undefined) {
    return "unclassified";
  }
  if (flags === "any") {
    return "inspect";
  }
  const separator = rest.indexOf("--");
  for (const arg of separator === -1 ? rest : rest.slice(0, separator)) {
    if (!arg.startsWith("-")) {
      // A revision makes diff compare commits, which prints a committed skill as added lines.
      if (subcommand === "diff") {
        return "unclassified";
      }
      continue;
    }
    const known =
      flags.has(arg.split("=")[0] ?? arg) || (subcommand === "log" && /^-\d+$/.test(arg));
    if (!known) {
      return "unclassified";
    }
  }
  return "inspect";
}

// Whether a command that reads a list of names from a pipe passes them on without running them.
function passesNames(words: string[]): boolean {
  const { verb, verbIndex } = splitVerb(words);
  const name = path.basename(verb ?? "");
  const args = words.slice(verbIndex + 1);
  if (name === "rg" || name === "grep") {
    return knownSearch(name, args);
  }
  if (name === "sed") {
    return classifySed(args) !== "unclassified";
  }
  return NAME_FILTERS.has(name);
}

// Whether every flag of a search is listed for its tool. Short flags may be clustered, as in
// `-rl`; a value flag takes the rest of its word, or the next word, as its value (`--glob=x`,
// `-gx`, `-g x`), so a value is never read as a flag.
function knownSearch(name: "rg" | "grep", args: string[]): boolean {
  const { values, other } = SEARCH_FLAGS[name];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      continue;
    }
    if (arg.startsWith("--")) {
      const [flag = arg] = arg.split("=");
      if (values.has(flag)) {
        index += arg.includes("=") ? 0 : 1;
      } else if (!other.has(arg)) {
        return false;
      }
      continue;
    }
    for (let at = 1; at < arg.length; at += 1) {
      const flag = `-${arg[at]}`;
      if (values.has(flag)) {
        index += at === arg.length - 1 ? 1 : 0;
        break;
      }
      if (!other.has(flag)) {
        return false;
      }
    }
  }
  return true;
}

// Whether a word the shell expands (a variable, a glob, or a brace expansion) can name a SKILL.md:
// its last path component, with each expansion read as its widest match, matches the name.
function couldExpandToSkillFile(word: string): boolean {
  if (!/[$*?[{]/.test(word)) {
    return false;
  }
  const source = word
    .slice(word.lastIndexOf("/") + 1)
    .replace(/\$\{[^}]*\}|\$\w+|\*/g, "\0")
    .replace(/[.+^()|\\$]/g, String.raw`\$&`)
    .replace(/\?/g, ".")
    .replace(
      /\{(?<options>[^{}]*)\}/g,
      (_match, options: string) => `(?:${options.split(",").join("|")})`,
    )
    .replace(/\0/g, ".*");
  try {
    return new RegExp(`^${source}$`).test("SKILL.md");
  } catch {
    return true;
  }
}

// head prints a file from line 1 only when every flag is a header flag or a plain positive count.
// A zero count, a negative count (all but the last N), or a suffix such as `0K` can print nothing.
// cat and nl print from line 1 under any short flag; a long option such as `--help` or `--version`
// can print something else and exit, so the caller refuses those.
function headPrintsBody(args: string[]): boolean {
  const positive = (count: string | undefined) =>
    count !== undefined && /^\d+$/.test(count) && !/^0+$/.test(count);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("-") || ["-q", "-v", "--quiet", "--silent", "--verbose"].includes(arg)) {
      continue;
    }
    if (["-n", "-c", "--lines", "--bytes"].includes(arg)) {
      index += 1;
      if (!positive(args[index])) {
        return false;
      }
      continue;
    }
    const count = /^(?:-[nc]|--(?:lines|bytes)=|-(?=\d))(?<count>.+)$/.exec(arg)?.groups?.["count"];
    if (!positive(count)) {
      return false;
    }
  }
  return true;
}

// The words after a command's verb that are neither flags, counts such as `-n 40`, nor sed's
// script.
function fileOperands(words: string[]): number {
  const { verb, verbIndex } = splitVerb(words);
  const operands = words
    .slice(verbIndex + 1)
    .filter((word) => !word.startsWith("-") && !/^\d+$/.test(word)).length;
  return path.basename(verb ?? "") === "sed" ? operands - 1 : operands;
}

// sed with a standalone -n as its only flag, a script of numeric ranges, and at most one file: a
// range from line 1 (or GNU's line 0) loads, and ranges that all start later inspect. sed reads
// several files as one stream, so its line numbers cannot be tied to one file. Any other sed is
// unclassified.
function classifySed(args: string[]): "load" | "inspect" | "unclassified" {
  const flags = args.filter((arg) => arg.startsWith("-"));
  const [script, ...files] = args.filter((arg) => !arg.startsWith("-"));
  if (
    flags.length !== 1 ||
    flags[0] !== "-n" ||
    script === undefined ||
    !SED_RANGES.test(script) ||
    files.length > 1
  ) {
    return "unclassified";
  }
  const starts = script.split(";").map((range) => Number.parseInt(range, 10));
  return starts.some((start) => start <= 1) ? "load" : "inspect";
}

// Codex runs each command through the user's login shell as `<shell> -lc '<command>'`.
function unwrapShell(command: string): string {
  const words = parseShell(command, keepVariable);
  const [shell, flag, inner] = words;
  if (
    words.length === 3 &&
    typeof shell === "string" &&
    /(?:^|\/)(?:ba|z|da)?sh$/.test(shell) &&
    typeof flag === "string" &&
    /^-\w*c\w*$/.test(flag) &&
    typeof inner === "string"
  ) {
    return inner;
  }
  return command;
}

// One simple command; `expands` marks each word the shell expands (an unquoted glob, or a word
// with a variable or a brace list), `piped` a command that reads the previous one's output, and
// `stdoutRedirected` a command whose standard output goes to a file instead of the command output.
// `reach` says whether the command runs always, whenever the whole command exits 0 (it sits in the
// last list, after `&&`), or unknown (after `&&` in an earlier list).
type Segment = {
  words: string[];
  expands: boolean[];
  piped: boolean;
  stdoutRedirected: boolean;
  reach: "always" | "on-success" | "unknown";
};

// Splits a command into simple commands joined by `&&`, `;`, `|`, or a line break, or returns the
// reason the command is not an accepted form: a heredoc, a herestring, a command substitution, any
// other control operator, a reserved word in command position, or a `cd` whose failure would not
// stop the rest. A comment and a backslash line continuation are accepted.
function parseAccepted(command: string): Segment[] | string {
  const text = acceptedText(command);
  if (text.refusal !== undefined) {
    return text.refusal;
  }
  const segments: Array<Omit<Segment, "reach"> & { list: number; first: boolean }> = [];
  // Lists are the runs of commands between `;` or line breaks.
  let list = 0;
  let first = true;
  let words: string[] = [];
  let expands: boolean[] = [];
  let piped = false;
  let stdoutRedirected = false;
  let skipNext = false;
  const tokens = parseShell(text.command, keepVariable);
  // The operator after each segment, to check what follows a `cd`.
  const after: Array<string | undefined> = [];
  for (const [index, token] of [...tokens, { op: ";" } as const].entries()) {
    if (typeof token === "string") {
      if (!skipNext) {
        words.push(token);
        // shell-quote returns an unquoted `*` or `?` glob as its own token, so a string's `*` and
        // `?` were quoted and stay literal; a `[` may still open a bracket glob.
        expands.push(/\$|\{[^}]*,|\[/.test(token));
      }
      skipNext = false;
      continue;
    }
    // acceptedText removed every comment it saw, so a comment here is one it read differently.
    if ("comment" in token) {
      return "unaccepted shell form: a comment";
    }
    if ("pattern" in token) {
      if (!skipNext) {
        words.push(token.pattern);
        expands.push(true);
      }
      skipNext = false;
      continue;
    }
    if (REDIRECT_OPERATORS.has(token.op)) {
      // A file-descriptor number before the operator belongs to the redirection.
      const fd = /^\d+$/.test(words.at(-1) ?? "") ? words.pop() : undefined;
      if (fd !== undefined) {
        expands.pop();
      }
      stdoutRedirected ||= redirectsStdout(token.op, fd, tokens[index + 1]);
      skipNext = true;
      continue;
    }
    // shell-quote reads `>|` as `>` then `|`; the `|` does not start a pipe.
    if (token.op === "<" || (token.op === "|" && operatorOf(tokens[index - 1]) === ">")) {
      continue;
    }
    if (!JOIN_OPERATORS.has(token.op)) {
      return `unaccepted shell form: ${token.op}`;
    }
    if (words.length > 0) {
      const { verb, verbIndex } = splitVerb(words);
      const run =
        verb === "builtin" || verb === "command"
          ? words.slice(verbIndex + 1).find((word) => !word.startsWith("-"))
          : verb;
      if (CONTROL_WORDS.has(words[0] ?? "")) {
        return `unaccepted shell form: ${words[0]}`;
      }
      if (SHELL_EXITS.has(run ?? "")) {
        return `unaccepted shell form: ${run}`;
      }
      segments.push({ words, expands, piped, stdoutRedirected, list, first });
      after.push(token.op);
    }
    words = [];
    expands = [];
    stdoutRedirected = false;
    piped = token.op === "|";
    if (token.op === ";") {
      list += 1;
      first = true;
    } else if (token.op === "&&") {
      first = false;
    }
  }
  for (const [index, segment] of segments.entries()) {
    const { verb, verbIndex } = splitVerb(segment.words);
    if (verb !== "cd") {
      continue;
    }
    const target = segment.words.slice(verbIndex + 1);
    const last = index === segments.length - 1;
    if (
      target.length !== 1 ||
      target[0] === "-" ||
      segment.piped ||
      (!last && after[index] !== "&&")
    ) {
      return "unaccepted shell form: a cd whose failure would not stop the rest";
    }
    if (segment.expands[verbIndex + 1] === true) {
      return "unaccepted shell form: a cd into a directory the shell expands";
    }
  }
  const lastList = segments.at(-1)?.list;
  return segments.map(({ list: segmentList, first: segmentFirst, ...segment }) => ({
    ...segment,
    reach: segmentFirst ? "always" : segmentList === lastList ? "on-success" : "unknown",
  }));
}

// Rewrites a command for shell-quote, which reads a line break as whitespace, does not see command
// substitutions, and drops the spacing that tells `2>x` from `2 >x`: a line break outside quotes
// becomes `;` unless an `&&` or `|` before it continues the list, a backslash line continuation and
// a comment are removed, a spaced number before `>` gets an explicit `1>` so it stays an argument,
// and a heredoc, a herestring, a command substitution, or ANSI-C quoting (`$'...'`) is refused.
function acceptedText(command: string): { command: string; refusal?: string } {
  let output = "";
  let quote: string | undefined;
  for (let at = 0; at < command.length; at += 1) {
    const char = command[at] ?? "";
    if (quote === "'") {
      quote = char === "'" ? undefined : quote;
      output += char;
      continue;
    }
    if (char === "\\") {
      if (command[at + 1] !== "\n") {
        output += command.slice(at, at + 2);
      }
      at += 1;
      continue;
    }
    if (char === "`" || command.startsWith("$(", at)) {
      return { command, refusal: "unaccepted shell form: a command substitution" };
    }
    if (quote === '"') {
      quote = char === '"' ? undefined : quote;
      output += char;
      continue;
    }
    if (command.startsWith("$'", at)) {
      return { command, refusal: "unaccepted shell form: ANSI-C quoting" };
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (command.startsWith("<<", at)) {
      return { command, refusal: "unaccepted shell form: a heredoc or herestring" };
    } else if (char === ">" && /(?:^|\s)\d+\s+$/.test(output)) {
      output += "1";
    } else if (char === "#" && (at === 0 || /[\s;&|()<>]/.test(command[at - 1] ?? ""))) {
      const end = command.indexOf("\n", at);
      at = (end === -1 ? command.length : end) - 1;
      continue;
    } else if (char === "\n") {
      output += /(?:&&|\|)\s*$/.test(output) ? " " : " ; ";
      continue;
    }
    output += char;
  }
  return { command: output };
}

function keepVariable(name: string): string {
  return `$${name}`;
}

function isAssignment(word: string): boolean {
  return /^[A-Za-z_]\w*=/.test(word);
}

function resolveFrom(cwd: string | undefined, word: string): string {
  if (cwd === undefined || path.posix.isAbsolute(word)) {
    return path.posix.normalize(word);
  }
  return path.posix.join(cwd, word);
}

// Whether a redirection sends standard output to a file. Codex aggregates standard error into the
// command output, so `>&2` keeps the text visible. shell-quote drops the spacing that tells
// `cat F 5>x` from `head -n 5 >x`, so only descriptor 2 is trusted to leave standard output alone.
function redirectsStdout(
  op: string,
  fd: string | undefined,
  target: ParseEntry | undefined,
): boolean {
  if (fd === "2") {
    return false;
  }
  if (op === ">" || op === ">>") {
    return true;
  }
  return op === ">&" && !(typeof target === "string" && /^\d+$/.test(target));
}

function operatorOf(token: ParseEntry | undefined): string | undefined {
  return typeof token === "object" && "op" in token ? token.op : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
