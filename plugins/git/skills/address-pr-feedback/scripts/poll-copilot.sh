#!/usr/bin/env bash
# Poll the GitHub Copilot review adapter on a pull request until it gives a terminal response for the
# current head, or exit once the acknowledgment window passes when the repository's configuration
# will not review that head and Copilot shows no activity for it. GITHUB-COPILOT.md maps the exit
# codes to the skill's states.
#
# Usage: poll-copilot.sh <pr-number-or-url> [interval-seconds] [max-polls]
#   Defaults: 60-second interval, 11 polls spanning the ten-minute response timeout.
#   ACK_POLLS  intervals to wait for acknowledgment of the head (default 2, the acknowledgment window)
#   REPO       forge-side base repository as owner/name (default: the URL argument, else the
#              checkout's remote)
#
# Observed activity outranks configuration: a Copilot review request created after the head was
# published, or a Copilot review of the head, starts the wait whatever the rules say. Only when
# neither exists does the script read the rules that apply to the base branch
# (repos/<repo>/rules/branches/<base>). Applicable rulesets layer, so a setting any
# `copilot_code_review` rule enables is in force: Copilot reviews the head a pull request opens with,
# the head it has when it first leaves draft, every pushed head under `review_on_push`, and drafts
# under `review_draft_pull_requests`. A pull request retargeted onto the base after it opened, by
# hand or when GitHub retargets it after its old base branch is deleted, never gets that opening
# review: only its first departure from draft after the retarget, or a head published after the
# retarget under `review_on_push`, starts one. A normal push leaves no timeline timestamp, so the
# head's publication time is the latest of its commit date, the pull request's creation, and the
# last force push. The earliest check suite created for the head on the head branch is the script's
# only evidence of when a normal push reached the branch: it decides whether the head was pushed after a
# retarget and when the acknowledgment window ends. A suite created after a retarget without a push
# reads as a push and ends in exit 4. When a retargeted head has no such check suite, the script
# cannot tell whether it was pushed after the retarget: it says so and waits for acknowledgment. The
# rules cannot show a personal Copilot setting or a manual request, so before exiting 7 or 8 the
# script waits until ACK_POLLS intervals have passed since the head reached the branch; the skill's
# final observation catches a review that starts later.
#
# Exit codes: 0 completed review of the head with no unresolved Copilot threads;
#             1 completed review of the head with unresolved Copilot threads (dumped);
#             2 Copilot reported that it could not review (quota or error); 3 the head changed;
#             4 the configuration should review the head but no acknowledgment came within
#               ACK_POLLS intervals; 5 max polls reached after acknowledgment;
#             6 observation failure;
#             7 the configuration does not review this pull request, Copilot never reviewed it, and
#               no Copilot activity appeared within the acknowledgment window;
#             8 the configuration does not review this head, and no Copilot activity appeared within
#               the acknowledgment window; the last head Copilot reviewed is printed.
# Run unsandboxed in the foreground (gh needs the keyring). To keep a log and the exit code:
#   poll-copilot.sh 123 > .local/poll.log; rc=$?; cat .local/poll.log
set -u -o pipefail
PR_ARG="${1:?pr number or url}"; INTERVAL="${2:-60}"; MAX="${3:-11}"; ACK_POLLS="${ACK_POLLS:-2}"
BOT="copilot-pull-request-reviewer[bot]"
trap 'echo "exit=$?"' EXIT
NUM="${PR_ARG##*/}"
[[ "$NUM" =~ ^[1-9][0-9]*$ ]] || { echo "bad pr argument: $PR_ARG"; exit 6; }
if [ -z "${REPO:-}" ] && [[ "$PR_ARG" =~ ^https://github\.com/([^/]+/[^/]+)/pull/ ]]; then
  REPO="${BASH_REMATCH[1]}"
fi
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}" || exit 6
[ -n "$REPO" ] || exit 6
observe() { echo "observation failure: $1"; exit 6; }
PR_JSON="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid,headRefName,baseRefName,isDraft,createdAt,state)" \
  || observe "pr view"
HEAD="$(jq -r .headRefOid <<<"$PR_JSON")"; BASE="$(jq -r .baseRefName <<<"$PR_JSON")"
BRANCH="$(jq -r .headRefName <<<"$PR_JSON")"
DRAFT="$(jq -r .isDraft <<<"$PR_JSON")"; PR_AT="$(jq -r .createdAt <<<"$PR_JSON")"
[ -n "$HEAD" ] && [ "$HEAD" != null ] && [ -n "$BASE" ] || observe "pr fields"
COMMIT_AT="$(gh api "repos/$REPO/commits/$HEAD" --jq .commit.committer.date)" || observe "head commit"
SUITE_AT="$(gh api --paginate "repos/$REPO/commits/$HEAD/check-suites" \
  | jq -r --arg b "$BRANCH" '.check_suites[] | select(.head_branch == $b) | .created_at' | sort | sed -n 1p)" \
  || observe "check suites"
FORCE_AT="$(gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="$NUM" -f query='
  query($owner:String!,$name:String!,$num:Int!){ repository(owner:$owner,name:$name){
    pullRequest(number:$num){ timelineItems(itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT], last:1){
      nodes{ ... on HeadRefForcePushedEvent { createdAt } } } } } }' \
  --jq '.data.repository.pullRequest.timelineItems.nodes[-1].createdAt // ""')" || observe "force pushes"
HEAD_AT="$(printf '%s\n' "$COMMIT_AT" "$PR_AT" "$FORCE_AT" | sort | tail -1)"
PUSHED_AT="$(printf '%s\n' "$HEAD_AT" "$SUITE_AT" | sort | tail -1)"
EVENTS="$(gh api --paginate "repos/$REPO/issues/$NUM/timeline" \
  --jq '.[] | select(.event == "base_ref_changed" or .event == "automatic_base_change_succeeded"
    or .event == "ready_for_review") | "\(.event) \(.created_at)"')" || observe "timeline events"
RETARGET_AT="$(grep -v '^ready_for_review ' <<<"$EVENTS" | cut -d' ' -f2 | sort | tail -1)"
READY_AT="$(grep '^ready_for_review ' <<<"$EVENTS" | cut -d' ' -f2 | sort | awk -v r="$RETARGET_AT" '$0 > r' \
  | sed -n 1p)" # the first departure from draft since the last retarget
echo "pr=$NUM repo=$REPO base=$BASE head=$HEAD draft=$DRAFT published>=$HEAD_AT" \
  "first-suite=${SUITE_AT:-none} retargeted=${RETARGET_AT:-never} left-draft=${READY_AT:-never}"

reviews() { # completed Copilot reviews: GITHUB-COPILOT.md defines no other state as a response
  gh api --paginate "repos/$REPO/pulls/$NUM/reviews" \
    --jq "[.[] | select(.user.login == \"$BOT\" and (.state == \"COMMENTED\" or .state == \"APPROVED\"))]" \
    | jq -s 'add // []'; }
requested_after_head() { # count Copilot review requests created at or after the head was published
  gh api --paginate "repos/$REPO/issues/$NUM/timeline" \
    --jq ".[] | select(.event == \"review_requested\" and .requested_reviewer.login == \"Copilot\"
      and .created_at >= \"$HEAD_AT\") | .created_at" | wc -l | tr -d ' '; }
head_still() {
  local h; h="$(gh pr view "$NUM" --repo "$REPO" --json headRefOid -q .headRefOid)" || observe "head"
  [ "$h" = "$HEAD" ] || { echo "head changed: $h"; exit 3; }
}
finish() { head_still; exit "$1"; } # every terminal classification re-reads the head
head_review() { jq -c --arg h "$HEAD" '[.[] | select(.commit_id == $h)] | last // empty' <<<"$1"; }
acked() { [ -n "$(head_review "$R")" ] || [ "$REQ" != 0 ]; }
poll_ack() {
  sleep "$INTERVAL"; head_still
  R="$(reviews)" || observe "reviews"; REQ="$(requested_after_head)" || observe "timeline"
}
window_left() { # seconds until ACK_POLLS intervals have passed since the head reached the branch
  jq -n --arg t "$PUSHED_AT" --argjson w "$((ACK_POLLS * INTERVAL))" \
    '($t | fromdateiso8601) + $w - now | floor' 2>/dev/null || echo 0
}

R="$(reviews)" || observe "reviews"
REQ="$(requested_after_head)" || observe "timeline"
LAST_REVIEWED="$(jq -r 'last | .commit_id // ""' <<<"$R")"

if ! acked; then
  RULES="$(gh api --paginate "repos/$REPO/rules/branches/$BASE" \
    --jq '.[] | select(.type == "copilot_code_review") | .parameters // {}')" \
    || observe "rules for $BASE"
  expected=no; why="no copilot_code_review rule applies to $BASE"
  if [ -n "$RULES" ]; then
    on_push="$(jq -s 'any(.[]; .review_on_push == true)' <<<"$RULES")" || observe "rule parameters"
    on_draft="$(jq -s 'any(.[]; .review_draft_pull_requests == true)' <<<"$RULES")" || observe "rule parameters"
    if [ "$DRAFT" = true ] && [ "$on_draft" != true ]; then
      why="no copilot_code_review rule for $BASE reviews draft pull requests"
    elif [ -n "$READY_AT" ] && [[ ! "$HEAD_AT" > "$READY_AT" ]]; then
      expected=yes; why="the pull request first left draft at $READY_AT with this head"
    elif [ -n "$RETARGET_AT" ] && [ "$on_push" = true ] && [ -z "$SUITE_AT" ] \
      && [[ ! "$PUSHED_AT" > "$RETARGET_AT" ]]; then
      expected=yes; why="cannot tell whether $HEAD was pushed after the retarget at $RETARGET_AT:"
      why="$why it has no check suite on $BRANCH"
    elif [ -n "$RETARGET_AT" ] && { [ "$on_push" != true ] || [[ ! "$PUSHED_AT" > "$RETARGET_AT" ]]; }; then
      why="the pull request was retargeted to $BASE at $RETARGET_AT, and the rules review only heads"
      why="$why pushed after that, under review_on_push (review_on_push=$on_push)"
    elif [ -n "$LAST_REVIEWED" ] && [ "$on_push" != true ]; then
      why="no copilot_code_review rule for $BASE sets review_on_push"
    else
      expected=yes; why="configuration reviews this head"
    fi
  fi
  if [ "$expected" = no ]; then
    echo "$why; waiting out the acknowledgment window for a review the rules do not show"
    while ! acked && [ "$(window_left)" -gt 0 ]; do poll_ack; done
  else
    echo "$why; waiting ${ACK_POLLS} interval(s) for acknowledgment"
    for _ in $(seq 1 "$ACK_POLLS"); do poll_ack; acked && break; done
  fi
  if ! acked; then
    if [ "$expected" = yes ]; then echo "no acknowledgment of $HEAD within $ACK_POLLS interval(s)"; finish 4; fi
    if [ -z "$LAST_REVIEWED" ]; then echo "not configured: $why; Copilot never reviewed this pull request"; finish 7; fi
    echo "no follow-up review: $why; last reviewed head=$LAST_REVIEWED"; finish 8
  fi
fi

echo "acknowledged; waiting for a review of $HEAD"
n=0
while [ -z "$(head_review "$R")" ]; do
  n=$((n + 1)); [ "$n" -gt "$MAX" ] && { echo "max polls reached"; finish 5; }
  sleep "$INTERVAL"; head_still
  R="$(reviews)" || observe "reviews"
done
REV="$(head_review "$R")"
echo "review id=$(jq -r .id <<<"$REV") state=$(jq -r .state <<<"$REV") submitted=$(jq -r .submitted_at <<<"$REV")"
echo "--- review body"; jq -r .body <<<"$REV"
if jq -e '.body | test("^\\s*Copilot\\b[^\\n.]{0,80}\\b(unable to|could not|couldn'"'"'t) review"; "i")' \
  <<<"$REV" >/dev/null; then
  echo "Copilot could not review this head"; finish 2
fi
THREADS="$(gh api graphql --paginate -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="$NUM" -f query='
  query($owner:String!,$name:String!,$num:Int!,$endCursor:String){ repository(owner:$owner,name:$name){
    pullRequest(number:$num){ reviewThreads(first:100, after:$endCursor){
      pageInfo{ hasNextPage endCursor }
      nodes{ id isResolved comments(first:100){ totalCount nodes{ author{login} path line body } } } } } } }' \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved | not) | select(.comments.nodes[0].author.login == "copilot-pull-request-reviewer")')" \
  || observe "review threads"
if [ -n "$THREADS" ]; then
  echo "--- unresolved Copilot threads"; jq . <<<"$THREADS"
  jq -r 'select(.comments.totalCount > (.comments.nodes | length))
    | "truncated: thread \(.id) has \(.comments.totalCount) comments; the dump shows the first \(.comments.nodes | length)"' \
    <<<"$THREADS"
  finish 1
fi
echo "no unresolved Copilot threads"; finish 0
