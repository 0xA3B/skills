@AGENTS.md

## Worktrees

- In Claude Code, start a parallel branch with `claude --worktree <branch>` or `EnterWorktree` named
  after the branch instead of `pnpm worktree:add`, and isolate a subagent with
  `isolation: "worktree"`. The `WorktreeCreate` and `WorktreeRemove` hooks in
  `.claude/settings.json` create and remove these worktrees through `scripts/worktree-add` and
  `scripts/worktree-remove --force`: the worktree lands under `.claude/worktrees/` with its
  dependencies installed, and a new branch starts from `origin/main`, fetched first. Enter an
  existing worktree with `EnterWorktree` and its path.
- Before `ExitWorktree` with `action: "remove"`, commit every change to keep. The removal needs
  `discard_changes: true`, because Claude Code cannot verify the state of a hook-made worktree, and
  the hook then deletes uncommitted changes and ignored files such as `.local/`. The removal keeps a
  branch with commits that neither `main` nor `origin/main` contains.
- After a session's branch merges, run `git fetch --prune origin`, so the removal sees the merge in
  `origin/main`. Then remove the worktree with `ExitWorktree`. If the main checkout the session
  returns to is clean and on `main`, run `git merge --ff-only origin/main` there; otherwise leave it
  and report that `main` is behind. During a worktree session, Claude Code refuses a `git -C` that
  targets the main checkout, so the fast-forward cannot come before the exit. After a squash or
  rebase merge, the removal keeps the branch and prints `kept branch`; once `git:merge-pr` has
  verified the merge, delete it with `git branch -D <branch>`.
- If `ExitWorktree` reports no active worktree session while the session still runs in the worktree,
  run these steps outside the sandbox, which blocks writes to the main checkout and to the
  worktree's `.claude/settings.json`: `git -C <main-checkout> fetch --prune origin`,
  `git -C <main-checkout> merge --ff-only origin/main` under the same clean-and-on-`main` condition,
  then `<main-checkout>/scripts/worktree-remove <branch> --force` as the session's last command. The
  removal leaves the session without the repository's hooks, so a later `EnterWorktree` makes a
  locked `worktree-<name>` branch with no dependencies, and Claude Code recreates
  `<worktree>/.claude/.cc-writes`. End the session, delete that directory, and start the next task
  from the main checkout.
- Claude Code keeps every hook-made subagent worktree after the subagent ends. After you merge or
  discard a subagent's commits, remove its worktree with `pnpm worktree:remove <branch>`, where
  `<branch>` is the `agent-...` branch `git worktree list` shows for it.
- `claude rm` keeps the hook-made worktree of a background session. Remove the worktree with
  `pnpm worktree:remove <branch>` first, then run `claude rm <id>`. If the session scheduled a
  wakeup, its `.claude/scheduled_tasks.lock` blocks the removal until you pass `--force`, which also
  deletes uncommitted changes.
