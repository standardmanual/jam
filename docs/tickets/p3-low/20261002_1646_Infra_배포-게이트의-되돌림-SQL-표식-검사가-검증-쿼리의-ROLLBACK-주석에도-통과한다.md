---
id: "20261002_1646"
category: Infra
priority: P3
status: OPEN
created: 2026-10-02
closed:
---

# [Infra] 배포 게이트의 되돌림 SQL 표식 검사가 검증 쿼리의 ROLLBACK 주석에도 통과한다

> 범위 밖 발견물(티켓 20261002_1257 게이트만 재실행, 민지 `sideFindings`).

## 핵심 요약

- 현상: `scripts/deploy-gate.mjs` 227행의 되돌림 표식 정규식 `^\s*--\s*(?:되돌림|ROLLBACK\b|DOWN\b)`은 주석 줄 첫머리만 본다. 그래서 마이그레이션 안의 검증 쿼리 주석 블록에 있는
  `-- ROLLBACK;`(트랜잭션을 되돌리는 확인용 문장) 줄에도 맞는다. 진짜 되돌림 SQL 블록이 없는 마이그레이션도 검증 쿼리에 `-- ROLLBACK;`만 있으면 게이트를 통과할 수 있다.
- 사례: `jam-web/supabase/migrations/214_today_cards_select_period.sql`에는 이런 줄이 2개 있다(이 파일은 진짜 `-- 되돌림 SQL` 블록도 있어 실제 문제는 없다).
- 구현 계획(안): 표식을 「블록 머리」로 좁힌다. 예: `-- 되돌림 SQL`·`-- ROLLBACK SQL`·`-- DOWN` 같은 머리말 줄만 인정하고, `-- ROLLBACK;`처럼 문장으로 끝나는 줄은 표식에서 뺀다.
  규칙의 단일 원천인 `.claude/skills/jam-work/references/db-migration-rules.md` §4의 형식 서술과 맞춘다.
- 관련 파일: `scripts/deploy-gate.mjs` 225–227행, 그 테스트(`scripts/*deploy-gate*.test.mjs` 확인), `db-migration-rules.md` §4.

## 완료 조건

- 검증 쿼리 주석에 `-- ROLLBACK;`만 있고 되돌림 블록이 없는 마이그레이션은 게이트에서 막힌다(테스트).
- `-- 되돌림 SQL` 블록이 있는 기존 마이그레이션(180번 이상)은 그대로 통과한다(테스트 또는 전체 검사).

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
