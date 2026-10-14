---
id: "20261014_1320"
category: Infra
priority: P2
status: OPEN
created: 2026-10-14
closed:
---

# [Infra] 드랍 시도 실패를 strava_sync_failures에 기록한다

## 핵심 요약

- 요구사항: 동기화 중 드랍 시도(`tryItemDrop`)가 던진 오류를 콘솔 로그에만 남기지 않고 `strava_sync_failures`에 `failure_type = 'drop_attempt_failed'`로 기록한다. 동기화 흐름·응답·반환값은 바뀌지 않는다.
- 구현 계획:
  1. 마이그레이션 `218_strava_sync_failures_drop_attempt_type.sql`: CHECK 제약 `strava_sync_failures_type_check`의 허용 값에 `drop_attempt_failed`를 더한다(되돌림 SQL 포함, 반복 실행 가능).
  2. `StravaSyncFailureType`에 값을 추가한다.
  3. `sync.ts`의 드랍 시도 catch에서 기존 `recordStravaSyncFailure`를 호출한다.
  4. 테스트를 추가한다.
  5. `02_DATA_MODEL.md`의 `failure_type` 값 목록을 갱신한다.
- 관련 파일:
  - `jam-web/supabase/migrations/218_strava_sync_failures_drop_attempt_type.sql` (신규. 기존 제약 정의는 `176_strava_sync_failures.sql`의 `strava_sync_failures_type_check`)
  - `jam-web/src/lib/strava/syncFailures.ts`: 타입 `StravaSyncFailureType`(15줄), `recordStravaSyncFailure`(36~54줄)
  - `jam-web/src/lib/strava/sync.ts`: `processFetchedActivities`의 드랍 시도 루프와 catch(1006~1019줄). 호출에 쓸 `supabase`·`userId`는 이 함수의 인자다.
  - `jam-web/src/lib/strava/__tests__/syncFailures.test.ts`: 기록 함수 테스트(36~70줄)
  - `jam-web/src/lib/strava/__tests__/`의 동기화 테스트 중 드랍 시도 실패를 다루는 파일이 있으면 그 파일에 추가한다. 없으면 새 파일을 만들기보다 `syncFailures.test.ts`에 함께 둔다.
  - 문서: `docs/service/prd/02_DATA_MODEL.md`(`### strava_sync_failures` 절, 115줄 부근)

## 배경 / 문제 정의

2026-10-14 위험 진단 검토의견은 「동기화 무음 실패로 보상이 영구 누락된다」고 주장했다. 코드를 확인한 결과 대부분은 사실과 달랐다. 활동의 「처리 완료」 표시는 배지·아이템북·미션 평가가 끝난 뒤(`sync.ts` 1096줄)에만 기록되고, 그 앞 단계의 오류는 바깥 catch(1355줄)에서 실패 기록·커서 롤백·재throw로 이어져 다음 동기화에서 다시 처리된다.

실제 누락 지점은 드랍 시도 한 곳이다(`sync.ts` 1011줄). 활동 단위로 오류를 삼키고 콘솔 로그만 남긴 뒤 그 활동을 처리 완료로 표시하므로, 그 활동의 드랍 기회는 복구되지 않는다. 실패 기록 테이블에도 쌓이지 않아 운영자가 발생 여부를 알 수 없다.

이 티켓은 복구 자동화가 아니라 **누락을 눈으로 볼 수 있게 만드는 것**까지가 범위다. 동기화 상태 머신·외부 큐는 도입하지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `error_message`에는 `stravaId`와 오류 메시지를 함께 적는다(예: `stravaId=<값>: <메시지>`). `user_id`는 기존 함수 인자 그대로 넣는다.
- 기록은 기존 `recordStravaSyncFailure`를 쓴다. 이 함수가 이미 예외를 흡수하므로 catch 안에 try/catch를 더 만들지 않는다.
- 호출은 `await` 한다. 드랍 시도는 `user_drop_state`를 읽고 쓰므로 순차 처리가 필수다(`sync.ts` 1008~1010줄 주석). 기존 `console.error`는 그대로 둔다.
- 이 티켓은 **드랍 시도만** 다룬다. 사용량 배지·JAM! 행동 지표 판정도 오류를 흡수하지만(`sync.ts` 301줄, 1116줄) 다음 동기화에서 따라잡는지 확인되지 않았으므로 기록 대상에 넣지 않는다.
- 선행: 티켓 20261014_1319(주간 KPI 집계 분리)를 먼저 머지한다. 순서가 바뀌면 드랍 시도 실패가 「동기화 실패 건수」에 섞인다.

### DB 관점 (CLAUDE.md 규칙 6)

- 이 변경은 CHECK 제약의 허용 값을 넓히는 **확장**이다. 옛 코드와 호환되며 축소 단계가 없다.
- 되돌림 SQL은 새 유형의 행을 먼저 지운 뒤 제약을 3개 값으로 복원하는 순서여야 한다. 행이 남은 채 복원하면 제약이 실패한다.
- 아현은 SQL 파일만 쓴다. 실행은 사용자 승인 뒤 카리나가 한다. Supabase는 staging·프로덕션 공용 단일 DB이므로 실행 즉시 프로덕션에 반영된다.
- 코드가 SQL보다 먼저 배포돼도 insert가 CHECK에 걸려 기록만 실패하고 `recordStravaSyncFailure`가 흡수하므로 서비스 장애는 없다. 그래도 순서는 SQL 실행 → 코드 배포로 한다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `tryItemDrop`이 throw하면 `strava_sync_failures`에 `failure_type = 'drop_attempt_failed'`와 해당 userId, `stravaId`가 담긴 `error_message`로 기록을 시도한다. 테스트로 고정한다.
- 기록이 실패해도(insert 오류·예외) 같은 배치의 다음 활동 드랍 시도가 이어진다. 테스트로 고정한다.
- `syncStravaActivities`의 반환값과 성공 응답은 바뀌지 않는다.
- `218_*.sql`이 제약을 4개 값으로 확장하고, 되돌림 SQL을 포함하며, 반복 실행해도 안전하다. `scripts/deploy-gate.mjs`의 되돌림 표식 검사를 통과한다.
- `02_DATA_MODEL.md`의 `failure_type` 값 목록이 갱신된다.

### 후속 범위 (담당: 카리나, 시점: 머지 승인 뒤)

- 사용자 승인 후 `218_*.sql`을 `apply_migration`으로 실행하고, 제약 정의를 조회해 4개 값이 반영됐는지 확인한다.
- 실행 뒤 `generate_typescript_types` 결과를 `database.generated.ts`와 대조한다(`failure_type`이 TEXT라 변화가 없어야 한다).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 실행 지표

| 실행 | 에이전트 수 | 전체 토큰 | 소요 시간 | 결과 |
|---|---|---|---|---|
| | | | | |
