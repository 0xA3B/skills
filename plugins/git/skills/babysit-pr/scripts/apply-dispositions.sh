#!/usr/bin/env bash
# Apply a round's review-thread dispositions to a GitHub pull request, then verify them: for each
# entry, reply on the thread, react to its first comment, and resolve it. `3. Triage and respond` in
# SKILL.md owns when a thread is ready for this.
#
# Usage: apply-dispositions.sh <pr-number-or-url> <dispositions-file>
#   REPO  forge-side base repository as owner/name (default: the URL argument, else the checkout's
#         remote)
# Needs gh and jq.
#
# The dispositions file is a JSON array of entries, applied in file order and numbered from 1 in
# messages:
#   {"thread": "<review thread node id>", "verdict": "accepted" | "rejected" | "none",
#    "reply": "<markdown text>"}
# Before any write, the script validates every entry and reads every review thread of the pull
# request; it writes nothing when the file is not a non-empty array of such entries, a thread is
# not a review thread of this pull request, a thread appears twice, a reply is empty, or a verdict
# is not one of the three values. Then, per entry:
#   1. reply, unless the thread's last comment body already equals the reply, compared without
#      surrounding whitespace and with LF line endings as the forge stores it, so a rerun after a
#      partial failure posts no duplicate;
#   2. react to the thread's first comment, 👍 (+1) for accepted and 👎 (-1) for rejected, nothing
#      for none; GitHub answers a repeated reaction with the existing one;
#   3. resolve, unless the thread is already resolved.
# Afterwards it reads the threads again and prints one line per entry:
#   <thread id> <verdict> replied|reply-present resolved|already-resolved verified|MISMATCH
# where verified means the thread is resolved and its last comment body equals the reply.
#
# Exit codes: 0 every entry verified; 1 every write was made but at least one entry printed
#             MISMATCH; 6 invalid input, a missing tool, or a failed gh call. A failed write stops
#             the run and names the entry and step; entries before it are applied, and rerunning
#             the same file resumes without duplicate replies.
# Reply text reaches gh only as a field value. Run unsandboxed (gh needs the keyring):
#   apply-dispositions.sh 123 <dispositions-file> > <log-file>; rc=$?; cat <log-file>
set -u -o pipefail
WORK=""
trap 'rc=$?; [[ -z "${WORK}" ]] || rm -rf "${WORK}"; echo "exit=${rc}"' EXIT
for tool in gh jq; do
  command -v "${tool}" >/dev/null 2>&1 || {
    echo "missing dependency: ${tool}"
    exit 6
  }
done
invalid() {
  printf 'invalid input: %s\n' "$@"
  exit 6
}
observe() {
  echo "observation failure: $1"
  exit 6
}
[[ $# -eq 2 ]] || invalid "usage: apply-dispositions.sh <pr-number-or-url> <dispositions-file>"
PR_ARG="$1"
FILE="$2"
NUM="${PR_ARG##*/}"
[[ "${NUM}" =~ ^[1-9][0-9]*$ ]] || invalid "bad pr argument: ${PR_ARG}"
[[ -f "${FILE}" ]] && [[ -r "${FILE}" ]] || invalid "cannot read the dispositions file ${FILE}"

SHAPE="$(jq -r -s 'if length == 1 and (.[0] | type) == "array"
  then (if .[0] == [] then "empty" else "array" end) else "other" end' "${FILE}" 2>/dev/null)" \
  || invalid "dispositions file is not valid JSON: ${FILE}"
[[ "${SHAPE}" != empty ]] || invalid "dispositions file has no entries: ${FILE}"
[[ "${SHAPE}" = array ]] || invalid "dispositions file is not a JSON array of entries: ${FILE}"
# shellcheck disable=SC2016 # $n, $e, $all, $x, and $prior are jq variables.
ERRORS="$(jq -r '
  (to_entries[] | (.key + 1) as $n | .value as $e
    | if ($e | type) != "object" then
        "entry \($n): must be an object with thread, verdict, and reply"
      elif ($e.thread | type) != "string" or $e.thread == "" then
        "entry \($n): thread must be a review thread node id string, such as PRRT_..."
      elif ($e.verdict | IN("accepted", "rejected", "none") | not) then
        "entry \($n) (\($e.thread)): verdict must be \"accepted\", \"rejected\", or \"none\", not \($e.verdict | tojson)"
      elif ($e.reply | type) != "string" or ($e.reply | test("\\S") | not) then
        "entry \($n) (\($e.thread)): reply must be non-empty markdown text"
      else empty end),
  ([to_entries[] | select((.value | type) == "object" and (.value.thread | type) == "string")
      | {n: (.key + 1), t: .value.thread}] as $all
    | $all[] | . as $x | ($all | map(select(.t == $x.t and .n < $x.n)) | first) as $prior
    | select($prior != null) | "entry \($x.n): thread \($x.t) already appears in entry \($prior.n)")' \
  "${FILE}")" || invalid "cannot read the entries of ${FILE}"
if [[ -n "${ERRORS}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do echo "invalid input: ${line}"; done <<<"${ERRORS}"
  exit 6
fi

if [[ -z "${REPO:-}" ]] && [[ "${PR_ARG}" =~ ^https://github\.com/([^/]+/[^/]+)/pull/ ]]; then
  REPO="${BASH_REMATCH[1]}"
fi
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}" || exit 6
[[ -n "${REPO}" ]] || exit 6
WORK="$(mktemp -d)" || observe "temporary directory"

# Every review thread of the pull request as {id, isResolved, first, last}: the first comment's
# database id, the reaction target, and the last comment's body.
fetch_threads() {
  # shellcheck disable=SC2016 # $owner, $name, $num, and $endCursor are GraphQL variables.
  gh api graphql --paginate -F owner="${REPO%/*}" -F name="${REPO#*/}" -F num="${NUM}" -f query='
    query($owner:String!,$name:String!,$num:Int!,$endCursor:String){ repository(owner:$owner,name:$name){
      pullRequest(number:$num){ reviewThreads(first:100, after:$endCursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ id isResolved firstComment: comments(first:1){ nodes{ databaseId } }
          lastComment: comments(last:1){ nodes{ body } } } } } } }' \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[]
      | {id, isResolved, first: .firstComment.nodes[0].databaseId, last: .lastComment.nodes[0].body}' \
    | jq -s . >"$1"
}
fetch_threads "${WORK}/before.json" || observe "review threads"
# shellcheck disable=SC2016 # $t, $ids, and $pr are jq variables.
UNKNOWN="$(jq -r --slurpfile t "${WORK}/before.json" --arg pr "#${NUM} in ${REPO}" '
  ($t[0] | map(.id)) as $ids | to_entries[] | select(.value.thread | IN($ids[]) | not)
  | "entry \(.key + 1): thread \(.value.thread) is not a review thread of pull request \($pr)"' \
  "${FILE}")" || observe "thread membership"
if [[ -n "${UNKNOWN}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do echo "invalid input: ${line}"; done <<<"${UNKNOWN}"
  exit 6
fi

field() { jq -r --argjson i "$1" ".[\$i].$2" "${FILE}"; }
# shellcheck disable=SC2016 # $i, $d, and $e are jq variables.
# The forge stores a comment body without surrounding whitespace and with LF line endings, so same
# compares two bodies in that form.
STATE_OF='def norm: gsub("\r\n"; "\n") | sub("^\\s+"; "") | sub("\\s+$"; "");
  def same($a; $b): ($a | type) == "string" and (($a | norm) == ($b | norm));
  $d[0][$i] as $e | [.[] | select(.id == $e.thread)][0]'
failed() { # a write of entry n failed at step $1
  echo "write failure: entry ${n} (${tid}) $1; the entries before it are applied," \
    "and rerunning the same file resumes"
  exit 6
}
COUNT="$(jq length "${FILE}")" || observe "entry count"
REPLIED=()
RESOLVED=()
for ((i = 0; i < COUNT; i++)); do
  n=$((i + 1))
  tid="$(field "${i}" thread)" || observe "entry ${n}"
  verdict="$(field "${i}" verdict)" || observe "entry ${n}"
  # jq -j and the trailing x keep the reply's trailing newlines, which $(...) would strip.
  reply="$(jq -j --argjson i "${i}" '.[$i].reply' "${FILE}" && printf x)" || observe "entry ${n}"
  reply="${reply%x}"
  state="$(jq -r --slurpfile d "${FILE}" --argjson i "${i}" \
    "${STATE_OF} | \"\(same(.last; \$e.reply)) \(.isResolved) \(.first)\"" "${WORK}/before.json")" \
    || observe "entry ${n} state"
  read -r present resolved comment <<<"${state}"

  if [[ "${present}" = true ]]; then
    REPLIED[i]="reply-present"
  else
    # shellcheck disable=SC2016 # $threadId and $body are GraphQL variables.
    gh api graphql -f threadId="${tid}" -f body="${reply}" -f query='
      mutation($threadId:ID!,$body:String!){ addPullRequestReviewThreadReply(
        input:{pullRequestReviewThreadId:$threadId, body:$body}){ comment{ id } } }' \
      >/dev/null || failed reply
    REPLIED[i]=replied
  fi

  case "${verdict}" in
    accepted) content=+1 ;;
    rejected) content=-1 ;;
    *) content="" ;; # none: validation admits no other verdict
  esac
  if [[ -n "${content}" ]]; then
    gh api -X POST "repos/${REPO}/pulls/comments/${comment}/reactions" -f content="${content}" \
      >/dev/null || failed react
  fi

  if [[ "${resolved}" = true ]]; then
    RESOLVED[i]="already-resolved"
  else
    # shellcheck disable=SC2016 # $threadId is a GraphQL variable.
    gh api graphql -f threadId="${tid}" -f query='
      mutation($threadId:ID!){ resolveReviewThread(input:{threadId:$threadId}){ thread{ isResolved } } }' \
      >/dev/null || failed resolve
    RESOLVED[i]=resolved
  fi
done

fetch_threads "${WORK}/after.json" || observe "review threads after the writes"
rc=0
for ((i = 0; i < COUNT; i++)); do
  ok="$(jq -r --slurpfile d "${FILE}" --argjson i "${i}" \
    "${STATE_OF} | . != null and .isResolved == true and same(.last; \$e.reply)" "${WORK}/after.json")" \
    || observe "entry $((i + 1)) verification"
  result=verified
  if [[ "${ok}" != true ]]; then
    result=MISMATCH
    rc=1
  fi
  echo "$(field "${i}" thread) $(field "${i}" verdict) ${REPLIED[i]} ${RESOLVED[i]} ${result}"
done
exit "${rc}"
