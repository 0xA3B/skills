#!/usr/bin/env bash
# Poll the GitHub Codex review adapter on a pull request until it gives a terminal signal for the
# current head, then dump every unresolved review thread in full. GITHUB-CODEX.md maps the exit
# codes to the skill's states; the defaults below are the login and summary marker it names.
#
# Usage: poll-codex.sh <pr-number-or-url> [interval-seconds] [max-polls]
#   Defaults: 60-second interval, 11 polls spanning the ten-minute response timeout.
#   ACK_POLLS  intervals to wait for acknowledgment of the head (default 2, the acknowledgment window)
#   BOT, MARK  reviewer login and summary-comment marker (defaults: the Codex connector)
#   REPO       forge-side base repository as owner/name (default: the URL argument, else the
#              checkout's remote)
#
# Acknowledgment of a head is the summary comment's Running line naming that head; a 👀 reaction
# counts only while no summary row exists and only when created after the head was published,
# because the connector does not re-create it for a re-pushed head and may leave a stale one. The
# clean signal is a 👍 reaction created at or after
# the summary's Completed timestamp for that head, or, when no summary row exists, a 👍 created
# after the head was published (a reaction-only clean round): the floor is the latest of the head
# commit date, the pull request's creation time, and the last force push, so a plain push of an
# already-created older commit is the one case an earlier 👍 can cover; the terminal line prints
# both timestamps for that case. The head is re-read after every terminal dump so a push during the
# wait exits 3 instead of classifying the old head.
#
# Exit codes: 0 completed review with no unresolved threads; 1 completed with unresolved threads;
#             2 the connector reported an error for the head; 3 the head changed; 4 no
#             acknowledgment within ACK_POLLS intervals; 5 max polls reached; 6 observation failure.
# Run unsandboxed in the foreground (gh needs the keyring). To keep a log and the exit code:
#   poll-codex.sh 123 > .local/poll.log; rc=$?; cat .local/poll.log
set -u -o pipefail
PR_ARG="${1:?pr number or url}"; INTERVAL="${2:-60}"; MAX="${3:-11}"; ACK_POLLS="${ACK_POLLS:-2}"
BOT="${BOT:-chatgpt-codex-connector[bot]}"
MARK="${MARK:-codex-pull-request-review-summary}"
trap 'echo "exit=$?"' EXIT
NUM="${PR_ARG##*/}"
[[ "$NUM" =~ ^[1-9][0-9]*$ ]] || { echo "bad pr argument: $PR_ARG"; exit 6; }
if [ -z "${REPO:-}" ] && [[ "$PR_ARG" =~ ^https://github\.com/([^/]+/[^/]+)/pull/ ]]; then
  REPO="${BASH_REMATCH[1]}"
fi
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}" || exit 6
[ -n "$REPO" ] || exit 6
HEAD="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid -q .headRefOid)" || exit 6
[ -n "$HEAD" ] || exit 6
SHORT="${HEAD:0:7}"
observe() { echo "observation failure: $1"; exit 6; }
COMMIT_AT="$(gh api "repos/$REPO/commits/$HEAD" --jq .commit.committer.date)" || observe "head commit"
PR_AT="$(gh pr view "$NUM" --repo "$REPO" --json createdAt -q .createdAt)" || observe "pr createdAt"
FORCE_AT="$(gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="$NUM" -f query='
  query($owner:String!,$name:String!,$num:Int!){ repository(owner:$owner,name:$name){
    pullRequest(number:$num){ timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT], last:1){
      nodes{ ... on HeadRefForcePushedEvent { createdAt } } } } } }' \
  --jq '.data.repository.pullRequest.timelineItems.nodes[-1].createdAt // ""')" || observe "force pushes"
HEAD_AT="$(printf '%s\n' "$COMMIT_AT" "$PR_AT" "$FORCE_AT" | sort | tail -1)"
[ -n "$HEAD_AT" ] || observe "head publication time"
echo "pr=$NUM repo=$REPO head=$HEAD published>=$HEAD_AT interval=${INTERVAL}s max=$MAX"

head_still() { # exit 3 when the head moved since the script started
  local h; h="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid -q .headRefOid)" || observe "head"
  [ -n "$h" ] || observe "empty head"
  [ "$h" = "$HEAD" ] || { echo "head changed: $h"; exit 3; }
}
finish() { head_still; exit "$1"; } # every terminal exit re-reads the head after the dump
summary_line() { # the summary comment's status line, or empty; fails on a gh error
  gh api --paginate "repos/$REPO/issues/$NUM/comments" \
    --jq ".[] | select(.user.login==\"$BOT\" and (.body|contains(\"$MARK\"))) | .body | split(\"\n\") | map(select(test(\"Running|Completed|Something|Failed\"))) | .[0] // \"\"" \
    | tail -1
}
reaction_count() { # $1 = content, $2 = earliest created_at (ISO) or empty; sums every page
  gh api --paginate "repos/$REPO/issues/$NUM/reactions?per_page=100" \
    --jq "[.[] | select(.user.login==\"$BOT\" and .content==\"$1\" and .created_at >= \"${2:-}\")] | length" \
    | awk '{ s += $1 } END { print s + 0 }'
}
completed_at() { # ISO timestamp from the Completed line, or empty
  sed -n 's/.*datetime="\([^"]*\)".*/\1/p' <<<"$1"
}
dump() {
  echo "=== unresolved review threads (head $HEAD)"
  local threads
  threads="$(gh api graphql --paginate -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="$NUM" -f query='
    query($owner:String!,$name:String!,$num:Int!,$endCursor:String){ repository(owner:$owner,name:$name){
      pullRequest(number:$num){ reviewThreads(first:100, after:$endCursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ id isResolved isOutdated path line
          comments(first:100){ nodes{ databaseId author{login} createdAt body } } } } } } }' \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved|not)
          | "--- thread \(.id) \(.path):\(.line) outdated=\(.isOutdated)",
            (.comments.nodes[] | "[\(.author.login) \(.createdAt) comment=\(.databaseId)]\n\(.body)\n")')" \
    || observe "review threads"
  local open; open="$(grep -c '^--- thread ' <<<"$threads" || true)"; OPEN="$open"
  [ -n "$threads" ] && printf '%s\n' "$threads"
  echo "=== pr state (unresolved threads: $open)"
  local state
  state="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid,mergeStateStatus,statusCheckRollup \
    --jq '{headRefOid,mergeStateStatus,checks:[(.statusCheckRollup // [])[]|{name:(.name//.context),status:(.conclusion//.state)}]}')" \
    || observe "pr state"
  echo "$state"
  local failing
  failing="$(jq -r '[.checks[] | select(.status != "SUCCESS" and .status != "SKIPPED") | .name] | join(", ")' <<<"$state")" \
    || observe "check state"
  case "$state" in
    *BLOCKED*)
      [ -n "$failing" ] && echo "note: BLOCKED includes checks not passing: $failing"
      [ "$open" -gt 0 ] && echo "note: BLOCKED includes $open unresolved review threads" ;;
  esac
  return 0
}

ack=0
for ((i=1; i<=MAX; i++)); do
  now="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid -q .headRefOid)" || observe "head"
  [ -n "$now" ] || observe "empty head"
  if [ "$now" != "$HEAD" ]; then echo "head changed: $now"; exit 3; fi
  summary="$(summary_line)" || observe "comments"
  eyes="$(reaction_count eyes "$HEAD_AT")" || observe "reactions"
  echo "$(date -u +%H:%M:%S) poll $i eyes=$eyes summary=[$summary]"
  case "$summary" in
    *Completed*"$SHORT"*)
      done_at="$(completed_at "$summary")"
      [ -n "$done_at" ] || observe "Completed line has no datetime"
      thumbs="$(reaction_count +1 "$done_at")" || observe "reactions"
      echo "terminal: completed review of $SHORT at $done_at; thumbs=$thumbs"; dump
      [ "$OPEN" -gt 0 ] && finish 1
      # A clean review posts its 👍 shortly after Completed; give the reaction two more polls.
      for ((j=1; j<=2 && thumbs==0; j++)); do
        sleep "$INTERVAL"
        thumbs="$(reaction_count +1 "$done_at")" || observe "reactions"
        echo "thumbs=$thumbs after extra poll $j"
      done
      finish 0 ;;
    *Something*"$SHORT"*|*Failed*"$SHORT"*) echo "terminal: reviewer reported an error for $SHORT"; dump; finish 2 ;;
    *Running*"$SHORT"*) ack=1 ;;
  esac
  if [ -z "$summary" ]; then
    # Reaction-only clean round: a 👍 created after the head commit with no summary row.
    thumbs="$(reaction_count +1 "$HEAD_AT")" || observe "reactions"
    if [ "$thumbs" -gt 0 ]; then
      echo "terminal: reaction-only clean signal for $SHORT; thumbs=$thumbs created after $HEAD_AT (head commit $COMMIT_AT)"; dump
      [ "$OPEN" -gt 0 ] && finish 1; finish 0
    fi
    [ "$eyes" -gt 0 ] && ack=1
  fi
  if [ "$ack" -eq 0 ] && [ "$i" -gt "$ACK_POLLS" ]; then echo "no acknowledgment of $SHORT within $ACK_POLLS intervals"; finish 4; fi
  [ "$i" -lt "$MAX" ] && sleep "$INTERVAL"
done
echo "max polls reached without a terminal signal"; dump; finish 5
