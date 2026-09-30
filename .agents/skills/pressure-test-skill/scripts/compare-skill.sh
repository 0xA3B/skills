#!/usr/bin/env bash
# Run one task in an isolated agent context with or without a skill loaded, so the outputs of the
# two conditions can be scored against the same rubric. SKILL.md describes the comparison this
# script serves; run it once per agent and condition and score the outputs by hand.
#
# Usage: compare-skill.sh <claude|codex> <skill|noskill> <skill-dir> <workspace-dir> <task-file> [run-dir]
#   skill-dir      plugins/<plugin>/skills/<skill> or .agents/skills/<skill>
#   workspace-dir  scratch workspace copied into the run before the agent starts, kept under
#                  .local/, never a committed fixture
#   task-file      the task prompt; the skill condition prefixes it with the skill callout
#   run-dir        defaults to .local/pressure/runs/<skill>-<agent>-<condition> under the checkout;
#                  a directory this script created before is replaced, any other is refused
#   EXTRA_SKILLS   space-separated skill dirs the target applies, staged alongside it: a plugin
#                  skill brings its whole plugin, a repo-local skill is copied as a project skill
#   MODEL          model override; defaults match the trigger evals: codex gpt-6-sol, claude opus
#   EFFORT         reasoning effort (default medium)
#   TOOLS          Claude tool list (default Read,Write,Edit,Glob,Grep,Bash,Skill)
#   CODEX_SOURCE_HOME  Codex home whose auth.json is copied (default ~/.codex)
#
# The agent runs in a copy of the workspace under the system temp directory, outside this
# checkout, so neither condition sees this repository's instruction files or repo-local skills;
# the copy moves to <run-dir>/workspace when the run ends. A workspace that is a repository root
# gets a fresh repository in the copy, so the agent's git commands cannot change the source.
# Plugins are copied whole next to the workspace and loaded the way each agent installs them
# (--plugin-dir on Claude Code, a local marketplace plus a pre-populated plugin cache on Codex), so
# a skill's plugin-root references resolve. The staged copy of the target skill carries a
# body-only canary token, as the trigger evals do, so a load leaves a signal even when the agent
# reads no further file. A manual-only target (frontmatter `disable-model-invocation: true`) is
# invoked with Claude's slash form, because the model cannot load it from a prose request. The run
# directory receives final.md, events.jsonl, stderr.log, and workspace/, and the script prints the
# agent's exit status, whether the skill loaded, and how many tool calls the agent's permission or
# sandbox layer denied.
#
# Exit codes: 0 the run is scoreable; 1 the run is invalid (the agent failed, reported an error,
#             did not load the skill in the skill condition, loaded it in the noskill condition,
#             was denied a tool call, or on Claude Code listed a skill outside the staged set);
#             2 usage.
# Claude in print mode denies reads of plugin reference files unless the plugin directory is also
# passed with --add-dir, and the permission classifier blocks a bypass-permissions launch, so the
# run uses accept-edits with an explicit tool list. Run unsandboxed: it copies Codex auth and
# launches the agent CLIs. A run takes minutes; the task is the whole workflow, not a trigger
# decision.
set -euo pipefail

usage() { echo "usage: compare-skill.sh <claude|codex> <skill|noskill> <skill-dir> <workspace-dir> <task-file> [run-dir]" >&2; exit 2; }
[ $# -ge 5 ] || usage
AGENT="$1"
CONDITION="$2"
SKILL_DIR="$(cd "$3" && pwd)"
SOURCE_WS="$(cd "$4" && pwd)"
TASK_FILE="$(cd "$(dirname "$5")" && pwd)/$(basename "$5")"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MARKER=".compare-skill-run"
MARKETPLACE="compare-skill"

# An inherited GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, or other repository-local variable would
# redirect the workspace setup and the agent's own git commands to another repository; git lists
# them itself. Author and committer variables stay; config passed through the environment
# (GIT_CONFIG_COUNT, GIT_CONFIG_PARAMETERS) goes with the rest.
unset $(git rev-parse --local-env-vars)

case "$AGENT" in claude | codex) ;; *) echo "agent must be claude or codex" >&2; usage ;; esac
case "$CONDITION" in skill | noskill) ;; *) echo "condition must be skill or noskill" >&2; usage ;; esac
[ -f "$TASK_FILE" ] || { echo "task file not found: $TASK_FILE" >&2; exit 2; }

# skill_kind <dir> prints "plugin <plugin-dir>" or "repo-local".
skill_kind() {
  case "$1" in
    */plugins/*/skills/*) echo "plugin $(cd "$1/../.." && pwd)" ;;
    */.agents/skills/*) echo "repo-local" ;;
    *) echo "skill dir must be plugins/<plugin>/skills/<skill> or .agents/skills/<skill>: $1" >&2; exit 2 ;;
  esac
}

SKILL_NAME="$(basename "$SKILL_DIR")"
read -r KIND PLUGIN_DIR <<< "$(skill_kind "$SKILL_DIR")"
PLUGIN_DIR="${PLUGIN_DIR:-}"
if [ "$KIND" = plugin ]; then
  CALLOUT="$(basename "$PLUGIN_DIR"):$SKILL_NAME"
else
  CALLOUT="$SKILL_NAME"
fi
MANUAL_ONLY=no
if sed -n '1,/^---$/p' "$SKILL_DIR/SKILL.md" | tail -n +2 | grep -Eq '^disable-model-invocation:[[:space:]]*true'; then
  MANUAL_ONLY=yes
fi

RUN="${6:-$ROOT/.local/pressure/runs/$SKILL_NAME-$AGENT-$CONDITION}"
mkdir -p "$RUN"
RUN="$(cd "$RUN" && pwd)"
refuse() { rmdir "$RUN" 2>/dev/null; echo "$1" >&2; exit 2; }
case "$SOURCE_WS/" in "$RUN"/*) refuse "workspace dir must not be inside the run dir" ;; esac
case "$RUN/" in "$SOURCE_WS"/*) refuse "run dir must not be inside the workspace dir" ;; esac
case "$TASK_FILE" in "$RUN"/*) refuse "task file must not be inside the run dir" ;; esac
# A nested .git file or symlink, an initialized submodule or a linked worktree, points at a
# repository the copy cannot carry: kept, it would reach the source; dropped, git inside the
# directory would act on the copy's outer repository. Such workspaces are unsupported until a
# task needs one. A nested .git directory is a self-contained repository and is copied with it.
nested_git="$(find "$SOURCE_WS" -path "$SOURCE_WS/.git" -prune -o -name .git ! -type d -print -quit)"
if [ -n "$nested_git" ]; then
  refuse "workspace dir holds a submodule or linked worktree, which comparison runs do not support: $nested_git"
fi
# The fresh repository leaves behind state that the changed-state check below cannot see: a
# repository-local filter driver changes what git stores once the agent edits a filtered file, and
# replacement refs or grafts change the history git presents. Such workspaces are unsupported.
if [ -e "$SOURCE_WS/.git" ]; then
  local_filters="$(git -C "$SOURCE_WS" config --show-scope --name-only --get-regexp '^filter\.' \
    | grep -E '^(local|worktree)[[:space:]]' || true)"
  replace_ref="$(git -C "$SOURCE_WS" for-each-ref --count=1 --format='%(refname)' refs/replace/)"
  grafts="$(git -C "$SOURCE_WS" rev-parse --path-format=absolute --git-path info/grafts)"
  if [ -n "$local_filters" ] || [ -n "$replace_ref" ] || [ -f "$grafts" ]; then
    refuse "workspace dir uses a repository-local filter driver, replacement refs, or grafts, which comparison runs do not support: $SOURCE_WS"
  fi
fi
# Replace only a directory this script created: a wrong run-dir argument must not delete data.
if [ -n "$(ls -A "$RUN")" ] && [ ! -f "$RUN/$MARKER" ]; then
  echo "run dir is not empty and was not created by this script: $RUN" >&2
  exit 2
fi
for artifact in workspace codex-home events.jsonl final.md stderr.log; do
  rm -rf "${RUN:?}/$artifact"
done
touch "$RUN/$MARKER"

# The agent works outside the checkout: an ancestor CLAUDE.md, AGENTS.md, or .claude/skills would
# otherwise load in both conditions, and a repo-local target would load its committed copy.
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/compare-skill.XXXXXX")"
SCRATCH="$(cd "$SCRATCH" && pwd)"
WS="$SCRATCH/workspace"
DEPLOY="$SCRATCH/deployment"
CODEX_HOME_DIR="$RUN/codex-home"
# The scratch directory holds canary-modified skill copies, so all of it goes once the workspace
# is out.
finish() {
  set +e
  rm -f "$CODEX_HOME_DIR/auth.json"
  if [ -d "$WS" ] && ! mv "$WS" "$RUN/workspace"; then
    echo "workspace left at $WS" >&2
    rm -rf "$DEPLOY" "$SCRATCH/repo-local"
    return
  fi
  rm -rf "$SCRATCH"
}
trap finish EXIT
# A copied .git entry would point git at the source repository: a linked worktree's .git file
# holds an absolute gitdir, so the agent's commits would land in the source. The copy drops the
# root .git entry, and a source that is a repository root gets a fresh repository holding its
# HEAD history, with the source's uncommitted and staged changes left as unstaged working-tree
# changes.
# changed_state <repo>: one line per path whose working-tree state differs from HEAD (from the
# empty tree before the first commit), plus each untracked path that is not ignored, sorted. A
# present regular file carries the blob git would store for it after the repository's own filters
# and line-ending rules, so content that the copy's missing state would change shows up too.
changed_state() {
  local base=HEAD path
  git -C "$1" rev-parse --quiet --verify HEAD > /dev/null \
    || base="$(git -C "$1" hash-object -t tree /dev/null)"
  # NUL-delimited paths reach the file test unquoted, whatever characters they hold.
  { git -C "$1" diff -z --no-ext-diff --no-renames --name-only "$base" --
    git -C "$1" ls-files -z --others --exclude-standard; } | sort -z | while IFS= read -r -d '' path; do
    if [ -f "$1/$path" ] && [ ! -L "$1/$path" ]; then
      echo "$path $(git -C "$1" hash-object --path="$path" -- "$path")"
    else
      echo "$path"
    fi
  done
}
cp -R "$SOURCE_WS" "$WS"
rm -rf "$WS/.git"
if [ -e "$SOURCE_WS/.git" ]; then
  branch="$(git -C "$SOURCE_WS" symbolic-ref --quiet --short HEAD || echo main)"
  git init --quiet --initial-branch "$branch" "$WS"
  # git status depends on config and info files a fresh repository does not inherit, so a clean
  # source would otherwise show fabricated changes in the copy: mode changes under
  # core.filemode=false, line-ending changes under core.autocrlf, or files the source's
  # info/exclude ignores. Only these carry over; remotes and hooks stay behind.
  for key in core.filemode core.autocrlf core.eol core.ignorecase core.symlinks \
    core.precomposeunicode core.excludesFile core.attributesFile; do
    value="$(git -C "$SOURCE_WS" config --get "$key" || true)"
    if [ -n "$value" ]; then git -C "$WS" config "$key" "$value"; fi
  done
  mkdir -p "$WS/.git/info"
  for file in info/exclude info/attributes; do
    source_file="$(git -C "$SOURCE_WS" rev-parse --path-format=absolute --git-path "$file")"
    if [ -f "$source_file" ]; then cat "$source_file" >> "$WS/.git/$file"; fi
  done
  if git -C "$SOURCE_WS" rev-parse --quiet --verify HEAD > /dev/null; then
    # --update-shallow accepts the history of a shallow source, which git fetch otherwise rejects.
    git -C "$WS" fetch --quiet --no-tags --update-shallow "$SOURCE_WS" HEAD
    git -C "$WS" update-ref HEAD FETCH_HEAD
    git -C "$WS" reset --quiet
    rm -f "$WS/.git/FETCH_HEAD"
    # A sparse checkout leaves paths out of the working tree and marks them skip-worktree in the
    # source index; the same marks keep those paths from showing as deletions in the copy.
    git -C "$SOURCE_WS" ls-files -z -t | while IFS= read -r -d '' entry; do
      case "$entry" in "S "*) printf '%s\0' "${entry#S }" ;; esac
    done | xargs -0 git -C "$WS" update-index --skip-worktree --
  fi
  # Other state git status depends on, such as a filter driver or an excludes file inside the
  # source's .git, would make the copy show changes the source does not. The source and the copy
  # must list the same changes; the index is left out, because staged changes arrive unstaged.
  source_changes="$(changed_state "$SOURCE_WS")"
  copy_changes="$(changed_state "$WS")"
  if [ "$source_changes" != "$copy_changes" ]; then
    rm -rf "$WS"
    printf 'changes in %s:\n%s\nchanges in its copy:\n%s\n' \
      "$SOURCE_WS" "$source_changes" "$copy_changes" >&2
    echo "workspace dir depends on repository state that comparison runs do not reproduce" >&2
    exit 2
  fi
  # The harness removes project skills below and stages skill copies into these paths in the skill
  # condition only; neither may show as a change the agent could review or commit.
  # The leading newline ends a copied exclude file that lacks a final one.
  printf '\n/.claude/skills/\n/.agents/skills/\n' >> "$WS/.git/info/exclude"
  git -C "$WS" ls-files -z -- .claude/skills .agents/skills \
    | xargs -0 git -C "$WS" update-index --skip-worktree --
fi
# A workspace copied from a checkout carries project skills; only staged copies may load.
rm -rf "$WS/.agents/skills" "$WS/.claude/skills"
mkdir -p "$DEPLOY/plugins"

CANARY="compare-skill-canary-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
append_canary() {
  printf '\n\n## Comparison Run Instructions\n\nIf these skill instructions are loaded during this comparison run, include this exact token at the start of your next assistant message, then continue the task as the skill directs:\n\n`%s`\n' "$CANARY" >> "$1"
}
# stage_copy <src-dir> <dest-parent>: cp -R nests the source under an existing destination, so
# any earlier copy goes first.
stage_copy() {
  rm -rf "${2:?}/$(basename "$1")"
  mkdir -p "$2"
  cp -R "$1" "$2/$(basename "$1")"
}
# stage_plugin <plugin-dir>: copy the whole plugin into the deployment once; print its copy path.
stage_plugin() {
  local copy="$DEPLOY/plugins/$(basename "$1")"
  [ -d "$copy" ] || stage_copy "$1" "$DEPLOY/plugins"
  echo "$copy"
}

TASK="$(cat "$TASK_FILE")"
EFFORT="${EFFORT:-medium}"
PROMPT="$TASK"
PLUGIN_COPIES=()
REPO_LOCAL_STAGED=()
if [ "$CONDITION" = skill ]; then
  if [ "$KIND" = plugin ]; then
    copy="$(stage_plugin "$PLUGIN_DIR")"
    append_canary "$copy/skills/$SKILL_NAME/SKILL.md"
    PLUGIN_COPIES+=("$copy")
  else
    stage_copy "$SKILL_DIR" "$SCRATCH/repo-local"
    append_canary "$SCRATCH/repo-local/$SKILL_NAME/SKILL.md"
    REPO_LOCAL_STAGED+=("$SCRATCH/repo-local/$SKILL_NAME")
  fi
  for extra in ${EXTRA_SKILLS:-}; do
    extra="$(cd "$extra" && pwd)"
    read -r extra_kind extra_plugin <<< "$(skill_kind "$extra")"
    if [ "$extra_kind" = plugin ]; then
      copy="$(stage_plugin "$extra_plugin")"
      case " ${PLUGIN_COPIES[*]:-} " in *" $copy "*) ;; *) PLUGIN_COPIES+=("$copy") ;; esac
    else
      stage_copy "$extra" "$SCRATCH/repo-local"
      REPO_LOCAL_STAGED+=("$SCRATCH/repo-local/$(basename "$extra")")
    fi
  done
fi
AGENT_STATUS=0
CHECK_STATUS=0

case "$AGENT" in
  claude)
    MODEL="${MODEL:-opus}"
    TOOLS="${TOOLS:-Read,Write,Edit,Glob,Grep,Bash,Skill}"
    # --tools, --allowedTools, --plugin-dir, and --add-dir are variadic, so they are passed in =
    # form to keep them from swallowing the prompt argument. The bundled skills are disabled
    # through --settings, which --setting-sources does not filter, so the workspace's own
    # .claude/settings.json stays as the source has it and loads as project settings.
    ARGS=(-p --output-format stream-json --verbose --permission-mode acceptEdits
      "--tools=$TOOLS" "--allowedTools=$TOOLS" '--settings={"disableBundledSkills":true}'
      --setting-sources project --strict-mcp-config --model "$MODEL" --effort "$EFFORT")
    if [ "$CONDITION" = skill ]; then
      if [ "$MANUAL_ONLY" = yes ]; then
        PROMPT="/$CALLOUT $TASK"
      else
        PROMPT="Use the $CALLOUT skill to handle this task: $TASK"
      fi
      for copy in "${PLUGIN_COPIES[@]:-}"; do
        [ -n "$copy" ] && ARGS+=("--plugin-dir=$copy" "--add-dir=$copy")
      done
      for staged in "${REPO_LOCAL_STAGED[@]:-}"; do
        [ -n "$staged" ] && stage_copy "$staged" "$WS/.claude/skills"
      done
    fi
    # Skills the init event may list: every skill of a staged plugin, each staged repo-local skill,
    # and the bundled skills Claude loads despite disableBundledSkills (doctor, as the trigger
    # evals exempt). Any other skill means the run was not isolated.
    ALLOWED=""
    for copy in "${PLUGIN_COPIES[@]:-}"; do [ -n "$copy" ] && ALLOWED="$ALLOWED $(basename "$copy"):"; done
    for staged in "${REPO_LOCAL_STAGED[@]:-}"; do [ -n "$staged" ] && ALLOWED="$ALLOWED $(basename "$staged")"; done
    (cd "$WS" && claude "${ARGS[@]}" "$PROMPT" < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, skill, canary, finalPath, allowedList] = process.argv.slice(1);
      const allowed = allowedList.split(" ").filter(Boolean);
      const exempt = new Set(["doctor"]);
      const isAllowed = (name) => exempt.has(name)
        || allowed.some((a) => a.endsWith(":") ? name.startsWith(a) : name === a);
      let calls = 0, canaries = 0, denied = 0, errors = 0, result = "missing", finalText = "", unstaged = [];
      for (const line of fs.readFileSync(events, "utf8").split("\n")) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "system" && e.subtype === "init") unstaged = (e.skills ?? []).filter((n) => !isAllowed(n));
        if (e.type === "system" && e.subtype === "permission_denied") denied += 1;
        if (e.type === "result") {
          result = e.is_error === true ? `error (${e.subtype})` : "ok";
          if (typeof e.result === "string") finalText = e.result;
          // The result lists the denied requests; the system event is not emitted for every denial.
          if (Array.isArray(e.permission_denials)) denied += e.permission_denials.length;
        }
        for (const block of e.message?.content ?? []) {
          if (block.type === "text" && String(block.text).includes(canary)) canaries += 1;
          if (block.type === "tool_use" && block.name === "Skill") {
            const label = String(block.input?.command ?? block.input?.skill ?? "");
            if (label === skill) calls += 1;
          }
          if (block.type === "tool_result" && block.is_error === true) errors += 1;
        }
      }
      fs.writeFileSync(finalPath, finalText);
      const loaded = calls > 0 || canaries > 0;
      console.log(`result: ${result}; skill loaded: ${loaded ? "yes" : "no"} (${calls} Skill tool calls, ${canaries} canary messages); denied tool calls: ${denied}; other tool errors: ${errors}; unstaged skills: ${unstaged.length === 0 ? "none" : unstaged.join(", ")}`);
      process.exitCode = result === "ok" && denied === 0 && unstaged.length === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "$CALLOUT" "$CANARY" "$RUN/final.md" "$ALLOWED")" || CHECK_STATUS=1
    ;;
  codex)
    MODEL="${MODEL:-gpt-6-sol}"
    mkdir -p "$CODEX_HOME_DIR"
    cp "${CODEX_SOURCE_HOME:-$HOME/.codex}/auth.json" "$CODEX_HOME_DIR/auth.json"
    {
      printf 'model = "%s"\nmodel_reasoning_effort = "%s"\n\n[features]\nplugins = true\n\n[projects."%s"]\ntrust_level = "trusted"\n' \
        "$MODEL" "$EFFORT" "$WS"
      if [ "${#PLUGIN_COPIES[@]}" -gt 0 ]; then
        printf '\n[marketplaces."%s"]\nsource_type = "local"\nsource = "%s"\n' "$MARKETPLACE" "$DEPLOY"
        for copy in "${PLUGIN_COPIES[@]}"; do
          printf '\n[plugins."%s@%s"]\nenabled = true\n' "$(basename "$copy")" "$MARKETPLACE"
        done
      fi
    } > "$CODEX_HOME_DIR/config.toml"
    if [ "${#PLUGIN_COPIES[@]}" -gt 0 ]; then
      # Codex reads plugin skills from its plugin cache, keyed by marketplace, plugin, and the
      # portable manifest's version, so each staged plugin is copied there as the trigger evals do.
      for copy in "${PLUGIN_COPIES[@]}"; do
        version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version' "$copy/plugin.json")"
        cache="$CODEX_HOME_DIR/plugins/cache/$MARKETPLACE/$(basename "$copy")"
        mkdir -p "$cache"
        cp -R "$copy" "$cache/$version"
        [ "$KIND" = plugin ] && [ "$copy" = "$DEPLOY/plugins/$(basename "$PLUGIN_DIR")" ] \
          && TARGET_PATH="$cache/$version/skills/$SKILL_NAME/"
      done
      mkdir -p "$DEPLOY/.agents/plugins"
      node -e '
        const [out, name, ...plugins] = process.argv.slice(1);
        require("fs").writeFileSync(out, JSON.stringify({
          name,
          interface: { displayName: "Comparison run" },
          plugins: plugins.map((p) => ({
            name: p,
            source: { source: "local", path: `./plugins/${p}` },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          })),
        }, null, 2));
      ' "$DEPLOY/.agents/plugins/marketplace.json" "$MARKETPLACE" "${PLUGIN_COPIES[@]##*/}"
    fi
    if [ "$CONDITION" = skill ]; then
      PROMPT="Use \$$CALLOUT to handle this task: $TASK"
      for staged in "${REPO_LOCAL_STAGED[@]:-}"; do
        [ -n "$staged" ] && stage_copy "$staged" "$WS/.agents/skills"
      done
      [ "$KIND" = plugin ] || TARGET_PATH="$WS/.agents/skills/$SKILL_NAME/"
    fi
    (cd "$WS" && CODEX_HOME="$CODEX_HOME_DIR" codex -a never -s workspace-write exec --json --ephemeral \
      --skip-git-repo-check --color never -C "$WS" -o "$RUN/final.md" -- "$PROMPT" \
      < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, target, canary, finalPath] = process.argv.slice(1);
      // An explicit $skill callout injects SKILL.md without a read, so the canary is the primary
      // signal and a read under the staged target directory, such as a reference file, the
      // secondary; the target path is empty in the noskill condition.
      const pattern = target ? new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : null;
      let reads = 0, canaries = 0, denied = 0, failed = [], result = fs.existsSync(finalPath) ? "ok" : "missing";
      for (const line of fs.readFileSync(events, "utf8").split("\n")) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "turn.failed") result = `error (${e.error?.message ?? "turn.failed"})`;
        const item = e.type === "item.completed" ? e.item : undefined;
        if (item?.type === "agent_message" && String(item.text).includes(canary)) canaries += 1;
        if (item?.type !== "command_execution") continue;
        if (item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0)) {
          const output = String(item.aggregated_output ?? "");
          if (/operation not permitted|permission denied/i.test(output)) denied += 1;
          else failed.push(`${String(item.command).split("\n")[0].slice(0, 80)} -> ${output.split("\n")[0].slice(0, 80)}`);
          continue;
        }
        if (pattern?.test(String(item.command))) reads += 1;
      }
      const loaded = reads > 0 || canaries > 0;
      console.log(`result: ${result}; skill loaded: ${loaded ? "yes" : "no"} (${reads} skill file reads, ${canaries} canary messages); denied tool calls: ${denied}; other failed commands: ${failed.length}`);
      for (const f of failed) console.log(`  failed: ${f}`);
      process.exitCode = result === "ok" && denied === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "${TARGET_PATH:-}" "$CANARY" "$RUN/final.md")" || CHECK_STATUS=1
    ;;
esac

echo "agent exit status: $AGENT_STATUS"
echo "$VERDICT"
echo "run: $RUN"
STATUS=0
[ "$AGENT_STATUS" -eq 0 ] && [ "$CHECK_STATUS" -eq 0 ] || STATUS=1
LOADED=no
printf '%s' "$VERDICT" | grep -q "skill loaded: yes" && LOADED=yes
[ "$CONDITION" = skill ] && [ "$LOADED" = no ] && STATUS=1
[ "$CONDITION" = noskill ] && [ "$LOADED" = yes ] && STATUS=1
[ "$STATUS" -eq 0 ] && echo "verdict: scoreable" || echo "verdict: invalid, rerun before scoring"
exit "$STATUS"
