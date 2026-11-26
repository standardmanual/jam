# 아현 참고 — 리뷰 브랜치 이어 쓰기·훅 거절

아현(`jam-developer`)은 정의 「When to read a reference」가 가리킬 때만 이 파일을 읽는다: 프롬프트가 기존 리뷰
브랜치를 넘겨줬을 때, 커밋·push 훅에 거절당했을 때, 프롬프트가 push하라고 할 때.

## Retry with a handed-over branch (Hard rule 5)

If the prompt tells you to resume an existing review branch, do not create a new branch — run the
stale-worktree check first (`scripts/cleanup-stale-worktree.sh <branch>`, the same script as the
fresh run in Hard rule 5), then `git checkout <branch>` (the local branch) and keep committing on
top of it. Review branches stay local (ticket 20261126_2309).

The script detaches a stale worktree holding that branch name (commits stay on the branch); its exit
code 2 is the stop in Hard rule 5.

## Commit-time rejections

- `.githooks/pre-commit` rejects a ticket `status` set to `CLOSED` or a touched `closed:` on
  `claude/jamwork-*` (Hard rule 4) — revert the status and commit again.
- `.githooks/pre-commit` rejects new files in `docs/archive/` and version copies (Hard rule 9).
  Folder write rules: `docs/README.md` 「폴더 지도와 쓰기 규칙」.
- A new canonical component without its same-name story is rejected by the commit-msg gate and
  `gen-component-list --check` (Hard rule 8).
- The UI approval gate (`.githooks/commit-msg`): Hard rule 14.

## No push, no CI stamp

Review branches stay local (Hard rule 5, ticket 20261126_2309): do not push, so there is no GitHub
Actions run for your branch — leave the CI URL out of `검증 결과` and write «CI 없음(로컬 브랜치)».
카리나 runs the full `scripts/verify.sh` in an `npm ci` install before merging (`SKILL.md` 4단계).
The code rules `.githooks/pre-push` enforces at 카리나's push (suppression comments without
`-- 사유`, `.skip`/`.only`, deleted tests, a raised `--max-warnings`) are listed in the definition's
「Verification before handing off」 — fix them before you hand off, or 카리나's push is rejected.
