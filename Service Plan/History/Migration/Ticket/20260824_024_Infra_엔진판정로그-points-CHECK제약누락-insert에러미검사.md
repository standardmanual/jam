---
id: 20260824_024
category: Infra
status: OPEN
created: 2026-08-24
closed:
---

# [Infra] 엔진 판정 로그의 `points` CHECK 제약 누락 + insert 에러 미검사 — 포인트 지급 실패가 전부 유실

## 배경 / 문제 정의

포인트 지급이 실패해도 **어드민이 감지할 수 있는 기록이 아무 데도 남지 않는다.**
`awardPoints()`는 실패 시 `logEngineDecision('points', 'point_award_failed', ...)`로 구조화
로그를 남기도록 설계돼 있으나, 그 호출이 DB CHECK 제약에 걸려 **단 한 건도 기록되지 않는다.**

원인은 두 가지가 겹친 것이다.

1. **DB 제약이 `'points'`를 모른다.**
   `jam-web/supabase/migrations/073_engine_decision_log.sql:8`
   `engine TEXT NOT NULL CHECK (engine IN ('badge', 'drop'))`
   이후 어떤 마이그레이션에서도 `'points'`가 추가되지 않았다.
   반면 `jam-web/src/lib/engine-log/index.ts:18`의 TS 시그니처는
   `engine: 'badge' | 'drop' | 'points'`로 `'points'`를 허용한다 —
   **타입과 스키마가 갈라져 있고, 타입만 보고 쓰면 런타임에 조용히 거절된다.**

2. **insert 실패를 아무도 보지 않는다.**
   같은 파일 `:28`의 `await table.insert(row)`가 반환된 `error`를 **검사하지 않는다.**
   `supabase-js`는 실패해도 throw하지 않고 `{ error }`를 반환하므로,
   이 함수를 감싼 `try/catch`는 아무것도 잡지 못한다. 제약 위반이 무성으로 사라진다.

### 실측 (2026-08-24, jam-prod `ceehnkzdbecxwzxrhhns`)

```sql
-- 현재 제약
CHECK ((engine = ANY (ARRAY['badge'::text, 'drop'::text])))

-- engine별 적재 현황
drop  / drop_attempt                         78건 (최근 2026-08-24 12:45)
badge / sync_result                          43건 (최근 2026-08-24 12:45)
drop  / drop_state_last_activity_mismatch    19건 (최근 2026-08-24 12:45)
points/ point_award_failed                    0건  ← 단 한 건도 없음
```

`badge`·`drop`은 정상 적재 중이므로 배관 자체는 살아있다. **`points`만 제약에 막혀 전량 유실**이다.

### 발견 경위

티켓 20260824_019(알림·소식 스키마 + T1 인라인 생성) 개선 리뷰 중 발견됐다.
019와 인과관계가 없는 **선행 결함**이며, 073(2026-08-01)에 `points` 호출부가 추가된 시점부터
계속 유실돼 왔다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **CHECK 제약을 `'points'`까지 확장한다.**
   - 마이그레이션 파일로 남긴다: `jam-web/supabase/migrations/097_engine_decision_log_points_engine.sql`
   - **`db` 유형 규칙에 따라 jam-developer는 파일 작성까지만 한다. 실행 금지.**
     (실행은 사용자 승인 후 오케스트레이터가 직접 처리)
   - 코드 전수 조사 결과 `logEngineDecision()`의 첫 인자로 쓰이는 값은
     `badge`(1건) · `drop`(10건) · `points`(1건) **3종뿐**이다. 다른 미반영 값은 없다.
     따라서 이번 확장 대상은 `'points'` 하나이며, 한 번에 반영한다.
     ```
     src/lib/badge-engine/index.ts:783            badge
     src/lib/drop-engine/index.ts:121,540,546,
       574,589,603,618,624                        drop (8)
     src/lib/missions/rewards.ts:91               drop
     src/lib/strava/sync.ts:537                   drop
     src/lib/points/index.ts:61                   points  ← 유실 중
     ```

2. **insert 결과의 `error`를 검사하고 `console.error`로 남긴다.**
   - **"삼키되 로그는 남긴다"가 이 프로젝트의 원칙이다.** 로그 실패가 본 흐름(배지 발급·포인트
     지급)을 깨뜨려서는 안 되므로 예외를 던지지 않되, 조용히 사라지지도 않게 한다.
   - 참조 패턴: `src/lib/notifications/index.ts` — `createNotification()`(:132),
     `recordPoiView()`(:187)가 `{ error }`를 destructure해 검사하고 `console.error` 후 정상 반환한다.
   - 로그 메시지에 `engine` · `event` · `userId`를 포함해 어느 호출부가 실패했는지 식별 가능하게 한다.

3. **`@ts-expect-error`를 좁은 캐스팅으로 교체한다.**
   `:27`의 `@ts-expect-error`는 반환값을 destructure하는 순간 그대로 두기 곤란하다.
   `src/lib/notifications/index.ts:37~68`에 **왜 `@ts-expect-error` 대신 좁은 캐스팅을 쓰는지**가
   이미 문서화돼 있다(억제 주석은 원인이 해소되는 순간 그 줄 자체가 컴파일 오류가 되어
   무관한 작업이 빌드를 깨뜨린다). 같은 패턴을 적용해 insert 인자가 **여전히 타입 검사를 받도록**
   한다 — 이번 결함이 "타입은 통과했는데 런타임에 거절됐다"는 성격이므로 특히 중요하다.

4. **타입 ↔ 스키마 동기화 장치를 남긴다.**
   이번 결함의 근원은 `engine` 유니온(TS)과 CHECK 제약(SQL)이 **서로를 모른 채 갈라진 것**이다.
   - `engine-log/index.ts`의 `engine` 파라미터를 명명된 타입(`EngineKind`)으로 승격하고,
     "값을 추가하면 CHECK 제약도 함께 확장해야 한다 + 마이그레이션 경로"를 주석으로 명시한다.
   - 097 마이그레이션에도 역방향 포인터(`src/lib/engine-log/index.ts`의 `EngineKind`)를 남긴다.

5. **단위 테스트를 추가한다.** `src/lib/engine-log/__tests__/log-engine-decision.test.ts`
   - `createServiceClient`를 목킹하는 기존 패턴을 따른다
     (`src/lib/notifications/__tests__/create-notification.test.ts` 참조).
   - 검증 항목:
     - insert에 넘어가는 row가 `{ user_id, engine, event, payload }` 계약을 지키는지
     - insert가 `{ error }`를 반환할 때 **`console.error`가 호출되고, 예외는 새어나가지 않는지**
     - insert가 throw할 때도 예외가 새어나가지 않는지(기존 try/catch 경로 회귀 방지)

6. **과거에 유실된 로그는 복구하지 않는다.** 기록 자체가 존재한 적 없으므로 소급 대상이 아니다.
   백필·추정 재구성 시도 금지.

### 범위 밖 (이번 티켓에서 하지 않는다)

- **T1 알림 생성 실패의 구조화 로그 승격.** `createNotification()` 실패는 현재 `console.error`만
  남는다. `logEngineDecision`이 정상화되면 `engine='notification'`으로 승격해
  "왜 소식이 안 생기지"를 SQL로 추적할 수 있게 되지만, 호출부 14곳 + 새 이벤트 타입 + CHECK
  제약 추가 확장이 얽혀 **별도 티켓이 맞다.** 이번 티켓 완료 보고에서 후속 제안으로 올린다.
- `npm run db:types` 실행. **금지** — Supabase CLI가 없어 셸 리다이렉트가
  `src/types/database.generated.ts`를 0바이트로 날린 뒤 실패한다(2026-08-24 실제 발생).
  타입 파일 수정이 필요하면 손으로 편집한다.

## 구현 계획

### 1) 마이그레이션 (작성만)

`jam-web/supabase/migrations/097_engine_decision_log_points_engine.sql`

```sql
ALTER TABLE public.engine_decision_log
  DROP CONSTRAINT IF EXISTS engine_decision_log_engine_check;
ALTER TABLE public.engine_decision_log
  ADD CONSTRAINT engine_decision_log_engine_check
  CHECK (engine IN ('badge', 'drop', 'points'));
```

- 제약명은 실측 확인된 `engine_decision_log_engine_check`를 그대로 쓴다.
- 기존 행은 전부 `badge`/`drop`이므로 재검증에 걸리는 행이 없다(140건 실측).
- 재실행 안전(idempotent)하게 `DROP CONSTRAINT IF EXISTS`를 먼저 둔다.

### 2) `src/lib/engine-log/index.ts`

- `EngineKind = 'badge' | 'drop' | 'points'` 명명 타입 + 동기화 주석
- insert 호출을 좁은 캐스팅으로 바꾸고 `const { error } = await ...`
- `error`가 있으면 `console.error('[engine-log] 기록 실패 — engine: …, event: …, userId: …', error)`
- 기존 `try/catch`는 유지(네트워크 예외 등 throw 경로 보존)
- 파일 상단 주석의 "try/catch로 흡수" 서술을 실제 동작에 맞게 갱신

### 3) 검증 (오케스트레이터가 DDL 적용 후 수행)

- 제약 정의에 `points`가 포함됐는지 `pg_constraint` 재조회
- `logEngineDecision`이 만드는 것과 **동일한 row 형태**를 service_role 클라이언트로 실제 insert해
  적재를 확인하고, 확인 후 프로브 행을 삭제
- `npx vitest run src/lib/engine-log` 통과
- 실제 `point_award_failed`는 `award_points` RPC가 실패해야 발생하는 사건이라 프로덕션에서
  인위 유발하지 않는다. 위 3종으로 "제약 통과 + 에러 관측 + 계약 유지"를 확인한다.

## 영향 범위

- **런타임 동작 변화 없음.** 로그 경로만 손대며, 실패 시 여전히 예외를 던지지 않는다.
- 마이그레이션 적용 후부터 `points` 로그가 적재되기 시작한다(기존 `badge`/`drop`에는 영향 없음).
- 어드민 화면에서 `engine_decision_log`를 읽는 코드는 없다(전수 확인) — 화면 회귀 없음.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **CHECK 제약 확장 (작성만, 미실행)** — `098_engine_decision_log_points_engine.sql`
   `DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT ... CHECK (engine IN ('badge','drop','points'))`.
   호출부 전수 재확인 결과 티켓 기재대로 `badge`(1) · `drop`(10) · `points`(1) 3종뿐이라
   이번 확장 대상은 `'points'` 하나다.
   **번호 재배정: 097 → 098.** 작업 도중 staging에 `097_train_subway_poi_category.sql`이
   먼저 병합·적용돼 097이 점유됐다(티켓 지정값에서 벗어난 유일한 항목).

2. **insert 에러 검사** — `const { error } = await table.insert(row)` 후 `error`가 있으면
   `console.error`로 `engine` · `event` · `userId`를 포함해 남긴다. 예외로 승격하지 않는다.
   기존 `try/catch`는 네트워크 예외 경로 보존을 위해 유지하고, catch 로그에도 동일한 식별자를 넣었다.

3. **`@ts-expect-error` → 좁은 캐스팅** — `EngineDecisionLogInsert` · `EngineDecisionLogTable`
   타입을 두고 `supabase.from(...) as unknown as EngineDecisionLogTable`로 객체째 캐스팅했다.
   insert 인자는 계속 타입 검사를 받는다(`notifications/index.ts`와 동일 패턴·동일 사유 주석).

4. **타입 ↔ 스키마 동기화 장치** — `EngineKind` 명명 타입으로 승격하고 "값 추가 시 CHECK 제약도
   함께 확장" + 제약명 + 마이그레이션 경로를 주석에 명시. 098에도 역방향 포인터(`EngineKind`)를 남겼다.

5. **단위 테스트 6건 추가** — insert row 계약 3건, 실패 격리 3건.

6. 과거 유실분은 소급하지 않았다(백필·재구성 없음).

### 변경된 파일
```
jam-web/supabase/migrations/098_engine_decision_log_points_engine.sql   (신규, 미실행)
jam-web/src/lib/engine-log/index.ts                                     (수정)
jam-web/src/lib/engine-log/__tests__/log-engine-decision.test.ts         (신규)
```

### 테스트 결과
- [x] `vitest run src/lib/engine-log` — 6/6 통과
- [x] `tsc --noEmit` — 오류 없음 (`@ts-expect-error` 제거 후에도 통과)
- [x] `eslint src/lib/engine-log` — 오류 없음
- [ ] DDL 적용 후 실 DB 검증 (오케스트레이터 담당) — `pg_constraint` 재조회 + 동일 row 형태
      service_role insert 프로브 → 확인 후 삭제

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

- **마이그레이션 번호를 티켓 지정값 097에서 098로 바꿨다.** 티켓 작성 시점 이후 staging에
  `097_train_subway_poi_category.sql`(티켓 20260824_023 Content)이 병합·적용되어 번호가 겹쳤다.
  같은 번호 2개를 두면 적용 순서가 모호해지므로 재배정이 불가피했다. 사유는 SQL 파일 헤더에도 남겼다.
- **DB는 실행하지 않았다.** `db` 유형 규칙에 따라 파일 작성까지만 수행했다.
- **`console.error` 메시지에 `userId`를 넣는다.** 유실이 다시 발생했을 때 "어느 호출부가
  얼마나 유실됐는지"를 로그만으로 추적할 수 있어야 하기 때문이다. `userId`가 null인
  엔진 전역 경고(`faction_constant_missing`)는 `'null'` 문자열로 출력된다.
- **목킹 테스트로는 CHECK 제약 자체를 검증할 수 없다.** 테스트가 보장하는 것은 "row 계약 유지 +
  실패 관측"까지이고, 제약 통과 여부는 DDL 적용 후 실 DB 확인 항목이다. 테스트 파일 상단에 명시했다.

### 잔여 이슈
- ~~**티켓 ID 충돌**~~ — 오케스트레이터가 게이트 리뷰 후 `20260824_023` → `20260824_024`로
  재배정해 해소했다(staging의 `20260824_023_Content_기차지하철-POI-카테고리-분리.md`와 겹쳤던 것).
  파일명·`id` 필드·본문 내 자기 참조·마이그레이션 헤더·테스트 주석을 함께 수정했다.
- **`recordFeedEvent()`(`src/lib/activity-feed/index.ts:72`)에 동일 결함이 남아있다.**
  `await q.insert(payload)`가 반환 `error`를 검사하지 않아 피드 기록 실패가 무성으로 사라진다.
  CHECK 제약 문제는 없어 이번처럼 전량 유실은 아니지만, "삼키되 로그는 남긴다" 원칙 위반이다.
  이번 티켓 범위 밖 — 별도 티켓 권장.
- **T1 알림 실패 로그 승격**(`engine='notification'`)은 티켓에 명시된 대로 범위 밖. 별도 티켓 필요
  (호출부 14곳 + 새 이벤트 타입 + CHECK 제약 재확장).
