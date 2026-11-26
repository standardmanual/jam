# 민지 게이트 판정 상세 — 점검표 항목별 기준

민지(`jam-reviewer`)는 모드 ①에서 정의 「When to read a reference」가 가리킬 때만, 걸린 항목의 절만 읽는다:
점검표 6·7·8·9·12번이 이번 티켓에 걸릴 때, `engine`·`db` 티켓일 때, 리뷰 브랜치에 CI 실행이 있을 때.
항목 번호와 유형별 적용은 정의 「Checklist」가 단일 원천이다.

## 1 Mechanical checks — when a CI status exists

If a CI status does exist (`gh run list --branch <branch> --limit 1 --json status,conclusion,databaseId,url`),
a `failure` conclusion — read the failing step with `gh run view <id> --log-failed`, put it in
`reasons`, and FAIL.

## 6 Design decision compliance

Raw visual values are rejected by `check-ui-rules` in verify/CI; judge what it cannot see. In
`ui`·`ds` diffs these are a `FAIL`: a new component outside `jam-web/src/components/ui/` that gets
its own look (e.g. from semantic token classes) instead of composing canonical components, and a new
canonical component / variant / token without a `- 사용자 승인: YYYY-MM-DD — …` line in the ticket or
its parent (the commit-msg gate is local only; CI does not re-check it). Layout-only wrappers
(position, size, gap) are allowed.

## 7 Storybook

A canonical component under `jam-web/src/components/ui/` added or changed without its same-name
`*.stories.tsx` changing where its states changed is a `FAIL` (`gen-component-list.mjs --check`
enforces existence).

## 8 SQL migration

Following `.claude/skills/jam-work/references/db-migration-rules.md` means: rollback SQL ships with
the file (trailing marker block or a sibling `_down.sql`), and a change that both adds and removes a
column/function is split into expand → switch → contract.

## 9 Security

Sub-items by `workType` (apply only the one that matches; `해당 없음` for the rest):

- `api`: an authentication check is called, authorization is enforced, inputs are validated,
  error responses do not leak internal detail
- `db`: RLS policy ships with the table/column; a `SECURITY DEFINER` function has
  `REVOKE FROM PUBLIC` (`DEV_PROCESS_GUARDRAILS.md` pattern 8); `service_role` access is
  minimized
- `admin`: the `ADMIN_EMAILS`/`ADMIN_SECRET` check path is present

## 12 Korean naturalness

`copy`·`ui`·`content` types only, when the diff has new/changed user-facing Korean text. Two
sources, both context-dependent — pattern matching already caught the rest at `verify.sh` time
(`scripts/check-slop.mjs`):

- `docs/service/writing/UX_WRITING_GUIDELINE.md` §7 (Anti-slop 판단 기준) — JAM-specific
  translationese/cliché/structure patterns (e.g. "~에 대해" overuse, "~하시기 바랍니다"
  formality clash, service-voice clichés, mixed sentence endings).
- `docs/service/writing/SLOP_DICTIONARY.md` §4 — general context-dependent AI-tell patterns
  (pronoun reference ambiguity, mechanically uniform sentence endings, stacked hedging,
  register drift within one document, awkward 형식명사/당위 constructions, anthropomorphised
  abstract subjects, dense repetition of connectives or 결산 lexicon).

A meaning-breaking violation (register collapse, ambiguous pronoun reference, a tone-matrix
mismatch that changes how the message reads) is `FAIL` material; a minor one is `WARN`. State only
what is wrong in `reasons` — do not suggest the rewritten phrasing (that stays 아현's job on retry,
same as any other `FAIL`).

## `engine`·`db` tickets

For `engine` and `db` tickets, base probability and issuance judgements on the simulator's
verification output, never on inference.

## 출력 칸의 근거 (정의 「Output」 보충)

- `hasKoreanCopy` · `koreanCopyText`: 12번 판정의 근거이자 오케스트레이터가 나중에 무엇을 검토했는지
  확인할 기록이다.
- `reviewedRange`: 판정문에 검토 범위를 남겨 나중에 대조할 수 있게 한다.
- `sideFindings`: `[중단]` 항목은 범위 밖이어도 배열 맨 앞에 두어 즉시 보고한다. verdict 값 자체는 바꾸지
  않는다 — 범위 밖이므로.
