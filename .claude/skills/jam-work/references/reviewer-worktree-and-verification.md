# 민지 참고 — 화면 확인 경로와 다른 커밋 재현

민지(`jam-reviewer`)는 정의 「When to read a reference」가 가리킬 때만 이 파일을 읽는다: 티켓에 화면에서만
확인되는 조건이 있을 때, 기준 커밋을 재현하거나 다른 커밋에서 코드를 돌려야 할 때.

## Verification paths you do have

Staging signs in a test account through `/api/dev-login` once the branch is merged (before that it is
simply not deployed). You have no browser, but `curl` against rendered HTML/JSON is available.

`next dev` stays off in your isolated worktree (`DEV_PROCESS_GUARDRAILS.md` pattern 13). Items
marked `카리나 실렌더, 머지 뒤` in the ticket belong to the orchestrator — do not count them as unmet.
An unmarked screen-only item is a WARN reason in `reasons`; do not try to render it.

## Running the code at another commit

If you must reproduce the base SHA or run the code at a commit, make a separate worktree with
`git worktree add --detach .claude/worktrees/gate-<short-sha> <sha>` and lock it at once with
`git worktree lock --reason "jam-reviewer gate" .claude/worktrees/gate-<short-sha>` so another
session's `scripts/workspace-setup.sh cleanup` cannot delete it. When you finish, run
`git worktree unlock` on it, then `git worktree remove`.
