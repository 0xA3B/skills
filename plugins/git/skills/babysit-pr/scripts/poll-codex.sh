#!/usr/bin/env bash
# Poll the GitHub Codex review adapter on a pull request until it gives a terminal signal for the
# current head, then dump every unresolved thread Codex opened in full. GITHUB-CODEX.md maps the exit
# codes to the skill's states; the defaults below are the login and summary marker it names.
#
# Usage: poll-codex.sh <pr-number-or-url> [interval-seconds] [max-polls]
#   Defaults: 60-second interval, 11 polls spanning the ten-minute response timeout.
#   ACK_POLLS  intervals to wait for acknowledgment of the head (default 2, the acknowledgment window)
#   BOT, MARK  reviewer login and summary-comment marker (defaults: the Codex connector)
#   REPO       forge-side base repository as owner/name (default: the URL argument, else the
#              checkout's remote)
#   EXPECT_HEAD  full SHA of the head the caller pushed. The forge can report the earlier head for
#              minutes after a push, so the script waits up to max-polls intervals for the forge to
#              report this head and exits 3 when it never does. Unset, the script classifies
#              whatever head the forge reports.
# Needs gh and jq.
#
# Acknowledgment of a head is the summary table's Running row naming that head; a 👀 reaction
# counts only when created after the head was published and no summary row names the head,
# because the connector does not re-create it for a re-pushed head and may leave a stale one. The
# clean signal is a 👍 reaction created at or after
# the summary's Completed timestamp for that head, or, when no summary row exists, a 👍 created
# after the head was published (a reaction-only clean round): the floor is the latest of the head
# commit date, the pull request's creation time, and the last force push, so a plain push of an
# already-created older commit is the one case an earlier 👍 can cover; the terminal line prints
# both timestamps for that case. The head and the base are re-read after every terminal dump so a
# push or a retarget during the wait exits 3 instead of classifying the old state. A review that
# completed before the pull request's last retarget covered the diff against the old base, so it
# does not count: the publication floor includes the retarget, and a Completed row older than it
# ends in exit 9 once the acknowledgment window passes without a newer review; a 👍 that follows
# such a row belongs to that review and is no reaction-only clean signal. The summary row gives no
# start time, so a review that was running when the pull request was retargeted and completed
# afterward still counts.
#
# Exit codes: 0 completed review with no unresolved Codex threads; 1 completed with unresolved
#             Codex threads; 2 the connector reported an error for the head; 3 the head or the base
#             changed, or the forge never reported EXPECT_HEAD; 4 no acknowledgment within
#             ACK_POLLS intervals; 5 max polls reached; 6 observation failure or a missing tool;
#             9 the head's only review predates the last retarget.
# Run unsandboxed (gh needs the keyring). To keep a log and the exit code:
#   poll-codex.sh 123 > <log-file>; rc=$?; cat <log-file>
set -u -o pipefail
PR_ARG="${1:?pr number or url}"
INTERVAL="${2:-60}"
MAX="${3:-11}"
ACK_POLLS="${ACK_POLLS:-2}"
BOT="${BOT:-chatgpt-codex-connector[bot]}"
MARK="${MARK:-codex-pull-request-review-summary}"
trap 'echo "exit=$?"' EXIT
for tool in gh jq; do
  command -v "${tool}" >/dev/null 2>&1 || {
    echo "missing dependency: ${tool}"
    exit 6
  }
done
EXPECT_HEAD="${EXPECT_HEAD:-}"
if [[ -n "${EXPECT_HEAD}" ]] && ! [[ "${EXPECT_HEAD}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "bad EXPECT_HEAD: ${EXPECT_HEAD} is not a full commit SHA"
  exit 6
fi
NUM="${PR_ARG##*/}"
[[ "${NUM}" =~ ^[1-9][0-9]*$ ]] || {
  echo "bad pr argument: ${PR_ARG}"
  exit 6
}
if [[ -z "${REPO:-}" ]] && [[ "${PR_ARG}" =~ ^https://github\.com/([^/]+/[^/]+)/pull/ ]]; then
  REPO="${BASH_REMATCH[1]}"
fi
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}" || exit 6
[[ -n "${REPO}" ]] || exit 6
observe() {
  echo "observation failure: $1"
  exit 6
}
read_head() { gh pr view "${NUM}" --repo "${REPO}" --json headRefOid -q .headRefOid; }
HEAD="$(read_head)" || observe "head"
for ((w = 0; ; w++)); do
  [[ -n "${HEAD}" ]] && [[ "${HEAD}" != null ]] || observe "empty head"
  [[ -z "${EXPECT_HEAD}" ]] || [[ "${HEAD}" = "${EXPECT_HEAD}" ]] && break
  if [[ "${w}" -ge "${MAX}" ]]; then
    echo "the forge reports ${HEAD}, not the expected ${EXPECT_HEAD}, after ${MAX} polls"
    exit 3
  fi
  echo "waiting for the forge to report ${EXPECT_HEAD}; it reports ${HEAD}"
  sleep "${INTERVAL}"
  HEAD="$(read_head)" || observe "head"
done
SHORT="${HEAD:0:7}"
BASE="$(gh pr view "${NUM}" --repo "${REPO}" --json baseRefName -q .baseRefName)" || observe "base"
[[ -n "${BASE}" ]] && [[ "${BASE}" != null ]] || observe "empty base"
COMMIT_AT="$(gh api "repos/${REPO}/commits/${HEAD}" --jq .commit.committer.date)" || observe "head commit"
PR_AT="$(gh pr view "${NUM}" --repo "${REPO}" --json createdAt -q .createdAt)" || observe "pr createdAt"
# shellcheck disable=SC2016 # $owner, $name, and $num are GraphQL variables.
FORCE_AT="$(gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="${NUM}" -f query='
  query($owner:String!,$name:String!,$num:Int!){ repository(owner:$owner,name:$name){
    pullRequest(number:$num){ timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT], last:1){
      nodes{ ... on HeadRefForcePushedEvent { createdAt } } } } } }' \
  --jq '.data.repository.pullRequest.timelineItems.nodes[-1].createdAt // ""')" || observe "force pushes"
RETARGET_AT="$(gh api --paginate "repos/${REPO}/issues/${NUM}/timeline" \
  --jq '.[] | select(.event == "base_ref_changed" or .event == "automatic_base_change_succeeded") | .created_at' \
  | sort | tail -1)" || observe "timeline events"
# A signal counts only when it follows both the head's publication and the last retarget.
HEAD_AT="$(printf '%s\n' "${COMMIT_AT}" "${PR_AT}" "${FORCE_AT}" "${RETARGET_AT}" | sort | tail -1)"
[[ -n "${HEAD_AT}" ]] || observe "head publication time"
echo "pr=${NUM} repo=${REPO} base=${BASE} head=${HEAD} published>=${HEAD_AT}" \
  "retargeted=${RETARGET_AT:-never} interval=${INTERVAL}s max=${MAX}"

still() { # exit 3 when the head or the base moved since the script started
  local now h b
  now="$(gh pr view "${NUM}" --repo "${REPO}" --json headRefOid,baseRefName \
    -q '"\(.headRefOid) \(.baseRefName)"')" || observe "head and base"
  h="${now%% *}"
  b="${now#* }"
  [[ -n "${h}" ]] && [[ "${h}" != null ]] || observe "empty head"
  [[ "${h}" = "${HEAD}" ]] || {
    echo "head changed: ${h}"
    exit 3
  }
  [[ -n "${b}" ]] && [[ "${b}" != null ]] || observe "empty base"
  [[ "${b}" = "${BASE}" ]] || {
    echo "base changed: ${b}"
    exit 3
  }
}
finish() {
  still
  exit "$1"
} # every terminal exit re-reads the head and the base after the dump
# The summary comment's first table row with a status, or empty; fails on a gh error. Only a table
# row names the commit: the comment's <details> header repeats the status without it.
summary_line() {
  gh api --paginate "repos/${REPO}/issues/${NUM}/comments" \
    --jq ".[] | select(.user.login==\"${BOT}\" and (.body|contains(\"${MARK}\"))) | .body | split(\"\n\") | map(select(startswith(\"|\") and test(\"Running|Completed|Something|Failed\"))) | .[0] // \"\"" \
    | tail -1
}
reaction_count() { # $1 = content, $2 = earliest created_at (ISO) or empty; sums every page
  gh api --paginate "repos/${REPO}/issues/${NUM}/reactions?per_page=100" \
    --jq "[.[] | select(.user.login==\"${BOT}\" and .content==\"$1\" and .created_at >= \"${2:-}\")] | length" \
    | awk '{ s += $1 } END { print s + 0 }'
}
completed_at() { # ISO timestamp from the Completed line, or empty
  sed -n 's/.*datetime="\([^"]*\)".*/\1/p' <<<"$1"
}
dump() {
  echo "=== unresolved Codex review threads (head ${HEAD})"
  local all threads
  # One line of JSON per unresolved thread from any reviewer; the PR-state line counts them all,
  # because merge readiness depends on every thread.
  # shellcheck disable=SC2016 # $owner, $name, $num, and $endCursor are GraphQL variables.
  all="$(gh api graphql --paginate -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="${NUM}" -f query='
    query($owner:String!,$name:String!,$num:Int!,$endCursor:String){ repository(owner:$owner,name:$name){
      pullRequest(number:$num){ reviewThreads(first:100, after:$endCursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ id isResolved isOutdated path line
          comments(first:100){ totalCount nodes{ databaseId author{login} createdAt body } } } } } } }' \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved|not) | tojson')" \
    || observe "review threads"
  # Codex's findings are the threads it opened. GraphQL names the author without the REST "[bot]".
  threads="$(jq -r --arg login "${BOT%\[bot\]}" 'select(.comments.nodes[0].author.login == $login)
    | "--- thread \(.id) \(.path):\(.line) outdated=\(.isOutdated)",
      (.comments.nodes[] | "[\(.author.login) \(.createdAt) comment=\(.databaseId)]\n\(.body)\n"),
      (select(.comments.totalCount > (.comments.nodes | length))
        | "truncated: the thread has \(.comments.totalCount) comments; the dump shows the first \(.comments.nodes | length)\n")' \
    <<<"${all}")" || observe "review thread filter"
  OPEN="$(grep -c '^--- thread ' <<<"${threads}" || true)"
  local open
  open="$(grep -c . <<<"${all}" || true)"
  [[ -n "${threads}" ]] && printf '%s\n' "${threads}"
  echo "=== pr state (unresolved threads: ${open})"
  local state
  state="$(gh pr view "${NUM}" --repo "${REPO}" --json headRefOid,mergeStateStatus,statusCheckRollup \
    --jq '{headRefOid,mergeStateStatus,checks:[(.statusCheckRollup // [])[]|{name:(.name//.context),status:(.conclusion//.state)}]}')" \
    || observe "pr state"
  echo "${state}"
  local failing
  failing="$(jq -r '[.checks[] | select(.status != "SUCCESS" and .status != "SKIPPED") | .name] | join(", ")' <<<"${state}")" \
    || observe "check state"
  case "${state}" in
    *BLOCKED*)
      [[ -n "${failing}" ]] && echo "note: BLOCKED includes checks not passing: ${failing}"
      [[ "${open}" -gt 0 ]] && echo "note: BLOCKED includes ${open} unresolved review threads"
      ;;
    *) ;;
  esac
  return 0
}

ack=0
stale=""
for ((i = 1; i <= MAX; i++)); do
  still
  summary="$(summary_line)" || observe "comments"
  # A Completed row older than the last retarget reviewed the diff against the old base.
  case "${summary}" in
    *Completed*"${SHORT}"*)
      done_at="$(completed_at "${summary}")"
      [[ -n "${done_at}" ]] || observe "Completed line has no datetime"
      # The row's timestamp carries fractional seconds and the timeline's does not; compare whole
      # seconds, so a review that completed in the retarget's own second still counts.
      done_second="${done_at%%.*}"
      done_second="${done_second%Z}Z"
      if [[ -n "${RETARGET_AT}" ]] && [[ "${done_second}" < "${RETARGET_AT}" ]]; then
        stale="${done_at}"
        summary=""
      fi
      ;;
    *) ;;
  esac
  eyes="$(reaction_count eyes "${HEAD_AT}")" || observe "reactions"
  echo "$(date -u +%H:%M:%S) poll ${i} eyes=${eyes} summary=[${summary}]"
  case "${summary}" in
    *Completed*"${SHORT}"*)
      thumbs="$(reaction_count +1 "${done_at}")" || observe "reactions"
      echo "terminal: completed review of ${SHORT} at ${done_at}; thumbs=${thumbs}"
      dump
      [[ "${OPEN}" -gt 0 ]] && finish 1
      # A clean review posts its 👍 shortly after Completed; give the reaction two more polls.
      for ((j = 1; j <= 2 && thumbs == 0; j++)); do
        sleep "${INTERVAL}"
        thumbs="$(reaction_count +1 "${done_at}")" || observe "reactions"
        echo "thumbs=${thumbs} after extra poll ${j}"
      done
      finish 0
      ;;
    *Something*"${SHORT}"* | *Failed*"${SHORT}"*)
      echo "terminal: reviewer reported an error for ${SHORT}"
      dump
      finish 2
      ;;
    *Running*"${SHORT}"*) ack=1 ;;
    *) ;;
  esac
  if [[ -z "${summary}" ]] && [[ -z "${stale}" ]]; then
    # Reaction-only clean round: a 👍 created after the head commit with no summary row.
    thumbs="$(reaction_count +1 "${HEAD_AT}")" || observe "reactions"
    if [[ "${thumbs}" -gt 0 ]]; then
      echo "terminal: reaction-only clean signal for ${SHORT}; thumbs=${thumbs} created after ${HEAD_AT} (head commit ${COMMIT_AT})"
      dump
      [[ "${OPEN}" -gt 0 ]] && finish 1
      finish 0
    fi
  fi
  # A 👀 created after the head was published acknowledges it unless a summary row names the head.
  case "${summary}" in *"${SHORT}"*) ;; *) [[ "${eyes}" -gt 0 ]] && ack=1 ;; esac
  if [[ "${ack}" -eq 0 ]] && [[ "${i}" -gt "${ACK_POLLS}" ]] && [[ -n "${stale}" ]]; then
    echo "the review of ${SHORT} completed at ${stale}, which predates the retarget at ${RETARGET_AT}"
    dump
    finish 9
  fi
  if [[ "${ack}" -eq 0 ]] && [[ "${i}" -gt "${ACK_POLLS}" ]]; then
    echo "no acknowledgment of ${SHORT} within ${ACK_POLLS} intervals"
    dump
    finish 4
  fi
  [[ "${i}" -lt "${MAX}" ]] && sleep "${INTERVAL}"
done
echo "max polls reached without a terminal signal"
dump
finish 5
