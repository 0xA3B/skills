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
#                  an existing run there is replaced
#   EXTRA_SKILLS   space-separated skill dirs staged alongside the target, for the skills the
#                  target applies; needed on Codex, and on Claude for a repo-local target (a
#                  plugin target on Claude loads its whole plugin)
#   MODEL          model override; defaults match the trigger evals: codex gpt-6-sol, claude opus
#   EFFORT         reasoning effort (default medium)
#   TOOLS          Claude tool list (default Read,Write,Edit,Glob,Grep,Bash,Skill)
#   CODEX_SOURCE_HOME  Codex home whose auth.json is copied (default ~/.codex)
#
# The agent runs in a copy of the workspace under the system temp directory, outside this
# checkout, so neither condition sees this repository's instruction files or repo-local skills;
# the copy moves to <run-dir>/workspace when the run ends. The run directory receives final.md,
# events.jsonl, stderr.log, and workspace/, and the script prints the agent's exit status, whether
# the skill loaded, and how many tool calls the agent's permission or sandbox layer denied.
#
# Exit codes: 0 the run is scoreable; 1 the run is invalid (the agent failed, reported an error,
#             did not load the skill in the skill condition, or was denied a tool call); 2 usage.
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

case "$AGENT" in claude | codex) ;; *) echo "agent must be claude or codex" >&2; usage ;; esac
case "$CONDITION" in skill | noskill) ;; *) echo "condition must be skill or noskill" >&2; usage ;; esac
[ -f "$TASK_FILE" ] || { echo "task file not found: $TASK_FILE" >&2; exit 2; }

SKILL_NAME="$(basename "$SKILL_DIR")"
case "$SKILL_DIR" in
  */plugins/*/skills/*)
    PLUGIN_DIR="$(cd "$SKILL_DIR/../.." && pwd)"
    CLAUDE_CALLOUT="$(basename "$PLUGIN_DIR"):$SKILL_NAME" ;;
  */.agents/skills/*)
    PLUGIN_DIR=""
    CLAUDE_CALLOUT="$SKILL_NAME" ;;
  *) echo "skill dir must be plugins/<plugin>/skills/<skill> or .agents/skills/<skill>" >&2; exit 2 ;;
esac

RUN="${6:-$ROOT/.local/pressure/runs/$SKILL_NAME-$AGENT-$CONDITION}"
mkdir -p "$RUN"
RUN="$(cd "$RUN" && pwd)"
case "$SOURCE_WS/" in "$RUN"/*) echo "workspace dir must not be inside the run dir" >&2; exit 2 ;; esac
case "$TASK_FILE" in "$RUN"/*) echo "task file must not be inside the run dir" >&2; exit 2 ;; esac
# Replace only the artifacts a previous run left, so a wrong run-dir argument cannot delete more.
for artifact in workspace codex-home events.jsonl final.md stderr.log; do
  rm -rf "${RUN:?}/$artifact"
done

# The agent works outside the checkout: an ancestor CLAUDE.md, AGENTS.md, or .claude/skills would
# otherwise load in both conditions, and a repo-local target would load its committed copy.
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/compare-skill.XXXXXX")"
SCRATCH="$(cd "$SCRATCH" && pwd)"
WS="$SCRATCH/workspace"
cp -R "$SOURCE_WS" "$WS"
CODEX_HOME_DIR="$RUN/codex-home"
finish() {
  set +e
  rm -f "$CODEX_HOME_DIR/auth.json"
  if [ -d "$WS" ]; then mv "$WS" "$RUN/workspace" || echo "workspace left at $WS" >&2; fi
  rmdir "$SCRATCH" 2>/dev/null
}
trap finish EXIT

stage_skill() {
  # cp -R nests the source under an existing destination, so any earlier copy goes first.
  rm -rf "${2:?}/$(basename "$1")"
  cp -R "$1" "$2/$(basename "$1")"
}

TASK="$(cat "$TASK_FILE")"
EFFORT="${EFFORT:-medium}"
PROMPT="$TASK"
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
      PROMPT="Use the $CLAUDE_CALLOUT skill to handle this task: $TASK"
      if [ -n "$PLUGIN_DIR" ]; then
        ARGS+=("--plugin-dir=$PLUGIN_DIR" "--add-dir=$PLUGIN_DIR")
      else
        mkdir -p "$WS/.claude/skills"
        stage_skill "$SKILL_DIR" "$WS/.claude/skills"
        for extra in ${EXTRA_SKILLS:-}; do
          stage_skill "$(cd "$extra" && pwd)" "$WS/.claude/skills"
        done
      fi
    fi
    (cd "$WS" && claude "${ARGS[@]}" "$PROMPT" < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, skill, finalPath] = process.argv.slice(1);
      let loaded = 0, denied = 0, errors = 0, result = "missing", finalText = "";
      for (const line of fs.readFileSync(events, "utf8").split("\n")) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "system" && e.subtype === "permission_denied") denied += 1;
        if (e.type === "result") {
          result = e.is_error === true ? `error (${e.subtype})` : "ok";
          if (typeof e.result === "string") finalText = e.result;
        }
        for (const block of e.message?.content ?? []) {
          if (block.type === "tool_use" && block.name === "Skill") {
            const label = String(block.input?.command ?? block.input?.skill ?? "");
            if (label === skill) loaded += 1;
          }
          if (block.type === "tool_result" && block.is_error === true) errors += 1;
        }
      }
      fs.writeFileSync(finalPath, finalText);
      console.log(`result: ${result}; skill loaded: ${loaded > 0 ? "yes" : "no"} (${loaded} Skill tool calls); denied tool calls: ${denied}; other tool errors: ${errors}`);
      process.exitCode = result === "ok" && denied === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "$CLAUDE_CALLOUT" "$RUN/final.md")" || CHECK_STATUS=1
    ;;
  codex)
    MODEL="${MODEL:-gpt-6-sol}"
    mkdir -p "$CODEX_HOME_DIR"
    cp "${CODEX_SOURCE_HOME:-$HOME/.codex}/auth.json" "$CODEX_HOME_DIR/auth.json"
    printf 'model = "%s"\nmodel_reasoning_effort = "%s"\n\n[projects."%s"]\ntrust_level = "trusted"\n' \
      "$MODEL" "$EFFORT" "$WS" > "$CODEX_HOME_DIR/config.toml"
    if [ "$CONDITION" = skill ]; then
      PROMPT="Use \$$SKILL_NAME to handle this task: $TASK"
      mkdir -p "$WS/.agents/skills"
      stage_skill "$SKILL_DIR" "$WS/.agents/skills"
      for extra in ${EXTRA_SKILLS:-}; do
        stage_skill "$(cd "$extra" && pwd)" "$WS/.agents/skills"
      done
    fi
    (cd "$WS" && CODEX_HOME="$CODEX_HOME_DIR" codex -a never -s workspace-write exec --json --ephemeral \
      --skip-git-repo-check --color never -C "$WS" -o "$RUN/final.md" -- "$PROMPT" \
      < /dev/null > "$RUN/events.jsonl" 2> "$RUN/stderr.log") || AGENT_STATUS=$?
    VERDICT="$(node -e '
      const fs = require("fs");
      const [events, skill, finalPath] = process.argv.slice(1);
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // An explicit $skill callout injects SKILL.md without a read, so any read under the skill
      // directory, such as a reference file, counts as the skill loading.
      const pattern = new RegExp(`skills/${escaped}/`);
      let loaded = 0, denied = 0, failed = [], result = fs.existsSync(finalPath) ? "ok" : "missing";
      for (const line of fs.readFileSync(events, "utf8").split("\n")) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "turn.failed") result = `error (${e.error?.message ?? "turn.failed"})`;
        const item = e.type === "item.completed" ? e.item : undefined;
        if (item?.type !== "command_execution") continue;
        if (item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0)) {
          const output = String(item.aggregated_output ?? "");
          if (/operation not permitted|permission denied/i.test(output)) denied += 1;
          else failed.push(`${String(item.command).split("\n")[0].slice(0, 80)} -> ${output.split("\n")[0].slice(0, 80)}`);
          continue;
        }
        if (pattern.test(String(item.command))) loaded += 1;
      }
      console.log(`result: ${result}; skill loaded: ${loaded > 0 ? "yes" : "no"} (${loaded} skill file reads); denied tool calls: ${denied}; other failed commands: ${failed.length}`);
      for (const f of failed) console.log(`  failed: ${f}`);
      process.exitCode = result === "ok" && denied === 0 ? 0 : 1;
    ' "$RUN/events.jsonl" "$SKILL_NAME" "$RUN/final.md")" || CHECK_STATUS=1
    ;;
esac

echo "agent exit status: $AGENT_STATUS"
echo "$VERDICT"
echo "run: $RUN"
STATUS=0
[ "$AGENT_STATUS" -eq 0 ] && [ "$CHECK_STATUS" -eq 0 ] || STATUS=1
if [ "$CONDITION" = skill ] && ! printf '%s' "$VERDICT" | grep -q "skill loaded: yes"; then STATUS=1; fi
[ "$STATUS" -eq 0 ] && echo "verdict: scoreable" || echo "verdict: invalid, rerun before scoring"
exit "$STATUS"
