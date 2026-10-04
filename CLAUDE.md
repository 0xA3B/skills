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
- Claude Code keeps every hook-made subagent worktree after the subagent ends. After you merge or
  discard a subagent's commits, remove its worktree with `pnpm worktree:remove <branch>`, where
  `<branch>` is the `agent-...` branch `git worktree list` shows for it.
- `claude rm` keeps the hook-made worktree of a background session. Remove the worktree with
  `pnpm worktree:remove <branch>` first, then run `claude rm <id>`. If the session scheduled a
  wakeup, its `.claude/scheduled_tasks.lock` blocks the removal until you pass `--force`, which also
  deletes uncommitted changes.
