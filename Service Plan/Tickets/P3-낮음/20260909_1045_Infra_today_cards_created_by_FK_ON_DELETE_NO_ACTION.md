---
id: 20260909_1045
category: Infra
priority: P3
status: OPEN
created: 2026-09-09
closed:
---

# [Infra] today_cards.created_by FK가 ON DELETE NO ACTION — 유저 완전삭제 시 잠재적 500 위험

## 배경 / 문제 정의
티켓 20260909_0911(유저 관리 강제 완전 삭제 기능) 게이트 리뷰 중 발견. `public.users(id)`를
참조하는 FK 전수 조사 결과, 대부분 `ON DELETE CASCADE`(또는 `SET NULL`)인데
`today_cards.created_by`만 `ON DELETE` 절이 없어(기본값 `NO ACTION`) 예외다.

현재는 라이브 DB의 모든 `today_cards` 행에서 `created_by`가 NULL이고, 앱 코드 어디에서도 이
컬럼에 값을 쓰지 않는다(사실상 데드 컬럼) — 그래서 지금 당장은 유저 완전 삭제 기능에 영향이
없다.

> **정정 (2026-09-14)**: 위 "데드 컬럼" 전제는 틀렸다. `jam-web/src/app/api/admin/today/route.ts`의
> POST 핸들러가 어드민 투데이카드 생성 시 `created_by`에 실제 관리자 id를 채워 넣는 실사용
> 컬럼이다. 따라서 컬럼 제거가 아니라 FK를 `ON DELETE SET NULL`로 재정의하는 방향으로 진행한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `created_by`를 실제로 채워 쓰는 기능이 생기기 **전에** 먼저 다음 중 하나로 정리:
  1. 컬럼이 정말 데드 코드라면 컬럼 자체를 제거하는 마이그레이션 작성
  2. 계속 쓸 계획이라면 `ON DELETE SET NULL`(또는 용도에 맞는 CASCADE)로 FK 재정의
- 방치할 경우: 향후 이 컬럼에 값이 채워진 유저를 신규 "완전 삭제" 기능으로 삭제하면
  FK 위반으로 500 에러가 발생할 수 있다.

## 구현 계획
- `today_cards.created_by`의 실제 사용처(생성 로직·읽는 화면)가 있는지 코드베이스 재확인 후
  정리 방향 결정. 없으면 컬럼 제거가 더 단순한 해법.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`today_cards.created_by`는 어드민 투데이카드 생성 API(`admin/today` POST)가 실제로 채워 쓰는
컬럼임이 확인돼, 컬럼 제거 대신 FK 제약을 `ON DELETE SET NULL`로 재정의하는 마이그레이션을
작성했다. 기존 제약(`today_cards_created_by_fkey`, 기본 명명 규칙 추정)을 `DROP CONSTRAINT IF
EXISTS`로 제거한 뒤 `ON DELETE SET NULL`로 재생성한다. 어드민 계정이 완전 삭제돼도
`today_cards` 행은 유지되고 `created_by`만 NULL로 바뀐다.

SQL 파일만 작성했으며 실행은 오케스트레이터가 사용자 승인 후 진행한다.

### 변경된 파일
```
jam-web/supabase/migrations/170_today_cards_created_by_fk_set_null.sql (신규)
```

### 테스트 결과
- [ ] 마이그레이션 미실행 (SQL 파일 작성까지만 진행, 실행은 사용자 승인 후 오케스트레이터)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- 컬럼 제거 방향은 1차 시도에서 "데드 컬럼" 전제가 틀렸음이 확인돼 폐기하고, FK
  `ON DELETE SET NULL` 재정의로 방향을 정정했다.
- 기존 FK 제약명을 실제 DB에서 직접 조회하지 못했다(이 세션은 DB 실행 권한이 없는
  jam-developer 역할). `today_cards_created_by_fkey`는 Postgres 기본 명명 규칙 추정치이며,
  실제 이름이 다르면 `DROP CONSTRAINT IF EXISTS`가 조용히 no-op 처리돼 신규 제약만 추가되고
  구 제약(NO ACTION)이 남을 수 있다 — 실행 전 오케스트레이터가 실제 제약명을 확인할 것.

### 잔여 이슈
- 마이그레이션 실행 후 `\d today_cards`(또는 동등 조회)로 FK 액션이 `SET NULL`로 정확히
  하나만 남았는지 확인 필요.
