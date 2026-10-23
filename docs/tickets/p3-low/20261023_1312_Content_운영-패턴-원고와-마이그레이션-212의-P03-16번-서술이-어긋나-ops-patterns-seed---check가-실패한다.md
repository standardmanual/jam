---
id: "20261023_1312"
category: Content
priority: P3
status: OPEN
created: 2026-10-23
---

# [Content] 운영 패턴 원고와 마이그레이션 212의 P03 16번 서술이 어긋나 ops-patterns-seed --check가 실패한다

## 핵심 요약

- 요구사항: `node scripts/ops-patterns-seed.mjs --check`가 불일치로 끝난다. 원고 `docs/service/content/OPS_PATTERNS.md`가 티켓 `20261019_1313`에서 P03의 16번 `impl` 서술을 고쳤는데, `jam-web/supabase/migrations/212_ops_patterns_seed.sql` 29줄은 옛 문구(«인벤토리가 가득 차면 지급을 건너뛴다»)로 남아 있다. 어긋남을 없앤다.
- 구현 계획: 먼저 212가 이미 DB에 실행됐는지 확인한다. 실행됐다면 새 보정 SQL을 쓰고, 실행 전이면 212를 재생성한다. DB를 바꾸는 일이라 실행 전에 사용자 승인을 받는다.
- 관련 파일: `docs/service/content/OPS_PATTERNS.md`(P03 16번), `jam-web/supabase/migrations/212_ops_patterns_seed.sql` 29줄, `scripts/ops-patterns-seed.mjs`(`--check`), 시험 `scripts/ops-patterns-seed.test.mjs`.

## 배경 / 문제 정의

티켓 `20261022_2248`의 게이트(민지)가 2026-10-23에 범위 밖 발견물로 남겼다(확신도 보통). 2248의 변경 이전부터 있던 어긋남이며, CI의 `verify`에는 걸려 있지 않다. 카리나는 이 어긋남을 직접 재현하지 않았다.

## 상세 요구사항

### 서비스/코드베이스 관점

- Supabase는 staging과 프로덕션이 공용 단일 DB다. DB를 바꾸는 단계는 실행 전에 파일명, 영향 범위, 되돌림 SQL 위치를 말하고 채팅에서 승인을 받는다.
- 번호를 가진 새 마이그레이션이 필요하면 원격 staging 기준으로 push 직전에 번호를 다시 확인한다.

## 완료 조건

- [ ] `node scripts/ops-patterns-seed.mjs --check`가 통과한다
- [ ] 원고, 마이그레이션, DB 세 곳의 P03 16번 서술이 같다

## 진행 기록

- 2026-10-23 티켓을 만들었다(2248 게이트의 범위 밖 발견물, 민지 판정 [참고]).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
