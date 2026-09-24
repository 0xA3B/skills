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
# the copy moves to <run-dir>/workspace when the run ends. Plugins are copied whole next to the
# workspace and loaded the way each agent installs them (--plugin-dir on Claude Code, a local
# marketplace plus a pre-populated plugin cache on Codex), so a skill's plugin-root references
# resolve. The staged copy of the target skill carries a body-only canary token, as the trigger
# evals do, so a load leaves a signal even when the agent reads no further file. A manual-only
# target (frontmatter `disable-model-invocation: true`) is invoked with Claude's slash form,
# because the model cannot load it from a prose request. The run directory receives final.md,
# events.jsonl, stderr.log, and workspace/, and the script prints the agent's exit status, whether
# the skill loaded, and how many tool calls the agent's permission or sandbox layer denied.
#
# Exit codes: 0 the run is scoreable; 1 the run is invalid (the agent failed, reported an error,
#             did not load the skill in the skill condition, loaded it in the noskill condition,
#             or was denied a tool call); 2 usage.
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
case "$SOURCE_WS/" in "$RUN"/*) echo "workspace dir must not be inside the run dir" >&2; exit 2 ;; esac
case "$TASK_FILE" in "$RUN"/*) echo "task file must not be inside the run dir" >&2; exit 2 ;; esac
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
cp -R "$SOURCE_WS" "$WS"
mkdir -p "$DEPLOY/plugins"
CODEX_HOME_DIR="$RUN/codex-home"
finish() {
  set +e
  rm -f "$CODEX_HOME_DIR/auth.json"
  if [ -d "$WS" ]; then mv "$WS" "$RUN/workspace" || echo "workspace left at $WS" >&2; fi
  rm -rf "$DEPLOY"
  rmdir "$SCRATCH" 2>/dev/null
}
trap finish EXIT

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
    mkdir -p "$WS/.claude"
    printf '{\n  "disableBundledSkills": true\n}\n' > "$WS/.claude/settings.json"
    # --tools, --allowedTools, --plugin-dir, and --add-dir are variadic, so they are passed in =
    # form to keep them from swallowing the prompt argument.
    ARGS=(-p --output-format stream-json --verbose --permission-mode acceptEdits
      "--tools=$TOOLS" "--allowedTools=$TOOLS" --setting-sources project --strict-mcp-config
      --model "$MODEL" --effort "$EFFORT")
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
    (cd "$WS" && claude "${ARGS[@]}" "$PROMPT" < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, skill, canary, finalPath] = process.argv.slice(1);
      let calls = 0, canaries = 0, denied = 0, errors = 0, result = "missing", finalText = "";
      for (const line of fs.readFileSync(events, "utf8").split("\n")) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "system" && e.subtype === "permission_denied") denied += 1;
        if (e.type === "result") {
          result = e.is_error === true ? `error (${e.subtype})` : "ok";
          if (typeof e.result === "string") finalText = e.result;
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
      console.log(`result: ${result}; skill loaded: ${loaded ? "yes" : "no"} (${calls} Skill tool calls, ${canaries} canary messages); denied tool calls: ${denied}; other tool errors: ${errors}`);
      process.exitCode = result === "ok" && denied === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "$CALLOUT" "$CANARY" "$RUN/final.md")" || CHECK_STATUS=1
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
    fi
    (cd "$WS" && CODEX_HOME="$CODEX_HOME_DIR" codex -a never -s workspace-write exec --json --ephemeral \
      --skip-git-repo-check --color never -C "$WS" -o "$RUN/final.md" -- "$PROMPT" \
      < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, skill, canary, finalPath] = process.argv.slice(1);
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // An explicit $skill callout injects SKILL.md without a read, so the canary is the primary
      // signal and any read under the skill directory, such as a reference file, the secondary.
      const pattern = new RegExp(`skills/${escaped}/`);
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
        if (pattern.test(String(item.command))) reads += 1;
      }
      const loaded = reads > 0 || canaries > 0;
      console.log(`result: ${result}; skill loaded: ${loaded ? "yes" : "no"} (${reads} skill file reads, ${canaries} canary messages); denied tool calls: ${denied}; other failed commands: ${failed.length}`);
      for (const f of failed) console.log(`  failed: ${f}`);
      process.exitCode = result === "ok" && denied === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "$SKILL_NAME" "$CANARY" "$RUN/final.md")" || CHECK_STATUS=1
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
