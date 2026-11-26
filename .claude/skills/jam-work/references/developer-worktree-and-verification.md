# 아현 참고 — 쓰기 결과 확인·격리 작업 폴더의 설치·시드 생성기

아현(`jam-developer`)은 정의 「When to read a reference」가 가리킬 때만 이 파일을 읽는다: 쓰기 결과를 확인해야
할 때, npm 설치 명령이 필요할 때, 컨텐츠 시드 생성기를 돌릴 때.

## Checking a write result (Hard rule 11)

Pressing an apply / save / delete / send button on a real badge, mission, collection or user
changes live data. Verify up to the rendered screen and the selection state only, and do not press
the write button. If the write result must be checked, use a user-approved dummy record named with a
`[TEST]` prefix, or call the API route directly and check only the response shape and status code
(`docs/agents/DEV_PROCESS_GUARDRAILS.md` pattern 13).

## node_modules link, `next dev` and npm install (Hard rule 11)

In your isolated worktree `jam-web/node_modules` is a link to the main folder: `next dev` does not
start there (cover the logic with unit tests and leave screen-only checks to the orchestrator,
pattern 13), and `npm install`/`ci`/`audit fix`/`update` would write into the main folder. If the
ticket needs one, first run `rm jam-web/node_modules && (cd jam-web && npm ci)` (`rm` without `-r`
removes only the link).

## Content seed generators (Hard rule 9)

Content seed generators (`docs/assets/content-seed/v5_*.py`) may be run from the worktree root: they
resolve paths relative to their own location and write into your worktree's
`jam-web/supabase/migrations/`.
