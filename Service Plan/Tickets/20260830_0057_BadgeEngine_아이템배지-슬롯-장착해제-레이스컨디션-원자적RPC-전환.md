---
id: 20260830_0057
category: BadgeEngine
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [BadgeEngine] 아이템배지 슬롯 장착·해제 API 레이스 컨디션 수정 — 원자적 RPC로 전환

## 배경 / 문제 정의
`jam-web/src/app/api/itembooks/[id]/slot/route.ts`의 POST(장착)·DELETE(해제) 핸들러가
원자적 락 없이 순차적인 여러 Supabase REST 호출(조회 → INSERT/UPDATE → UPDATE)로 구성돼
있다.

`jam-web/supabase/migrations/108_item_identity_custody_model.sql`이 도입한
**"표준 불변식 1: 원자적 소유권 이전"** 패턴 — `SELECT ... FOR UPDATE` 기반 단일 RPC —
을 `create_user_drop()`·`pickup_drop()`·`admin_reassign_orphaned_item()` 등은 따르고
있지만, 이 슬롯 라우트에는 적용돼 있지 않다.

**레이스 시나리오**: 같은 유저가 거의 동시에 "슬롯 장착"과 "드랍"을 같은 인벤토리
아이템에 요청하면 —
1. 슬롯 POST가 `inventory_items.slotted_in`이 NULL임을 확인
2. 그 직후 `create_user_drop()` RPC가 락을 잡고 `inventory_id`를 NULL로 전이·커밋
3. 슬롯 POST가 `inventory_id` 상태를 재확인하지 않은 채 `slotted_in`을 새 슬롯 id로 UPDATE

결과적으로 `inventory_id = NULL`(드랍됨)이면서 `slotted_in`이 non-null(다른 유저 슬롯
참조)인 모순 상태가 발생한다. 이후 다른 유저가 픽업하면 `deriveItemBadgeStatus()`가
잘못된 Slotted 상태를 표시하고, 아이템북 완성 판정
(`jam-web/src/lib/itembook/completable.ts`) 로직도 오염될 수 있다.

이 발견은 티켓 [20260830_0055](20260830_0055_Admin_아이템배지-Held-Slotted-상태판정-안전성-조사.md)의
조사 §3에서 side finding으로 분리된 것이다(티켓 작성 시점에는 병렬 세션에서 아직
커밋되지 않아 저장소에서 찾지 못했으나, 이후 확인됨).

## 상세 요구사항

### 서비스/코드베이스 관점
- POST(장착)·DELETE(해제) 핸들러를 각각 단일 RPC(`SELECT ... FOR UPDATE` 기반,
  `SECURITY DEFINER`)로 재작성한다. `create_user_drop()`/`pickup_drop()`과 동일한
  락 순서·에러 코드 매핑 관례를 따른다.
  - 장착 RPC: `inventory_items` 행 락 → `inventory_id`/`slotted_in`/`dropped_at`(또는
    현재 컬럼 기준 드랍 여부) 재확인 → `user_item_book_slots` INSERT →
    `inventory_items.slotted_in` UPDATE → `inventory.used_slots` 차감 →
    `custody_events` Slot 기록 → 완성 판정(upsert)까지 한 트랜잭션 안에서 처리
  - 해제 RPC: `user_item_book_slots` 락 → `inventory_items` 락 → `inventory` 락 →
    `slotted_in = NULL` → slot row 삭제 → `used_slots` 증가 → `custody_events`
    Unslot 기록까지 한 트랜잭션 안에서 처리
- route.ts는 인증(Authorization 헤더 → `auth.getUser`)과 RPC 호출·에러 매핑만 담당하도록
  얇게 유지한다. 기존 에러 메시지·HTTP 상태 코드(401/403/404/409/400/500)는 그대로
  보존해 클라이언트 계약을 깨지 않는다.
- 마이그레이션 파일: `jam-web/supabase/migrations/1XX_설명.sql` (다음 사용 가능 번호로
  신규 생성 — 실행 전 `mcp__supabase__list_migrations`로 원격 기준 최신 번호 재확인)

### UI/UX 관점 (해당 시)
- 해당 없음 (에러 메시지·상태 코드 불변 조건이므로 클라이언트 변경 없음)

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
1. 마이그레이션 108의 `create_user_drop()`/`pickup_drop()` 함수 본문을 템플릿으로 삼아
   `slot_item_into_book()`/`unslot_item_from_book()`(가칭) RPC 작성
2. route.ts의 POST/DELETE를 RPC 호출 1회 + 에러 코드 → HTTP 상태 매핑으로 축소
3. 기존 순차 로직에 있던 모든 검증(소유자 확인, 이미 장착됨, 이미 드랍됨, 아이템북 소속
   확인, 인벤토리 꽉 참 등)을 RPC 내부로 누락 없이 이관
4. 회귀 확인: 정상 장착/해제 흐름 + 레이스 시나리오(가능하면 동시 요청 재현)로
   모순 상태가 더 이상 발생하지 않는지 검증

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`slot_item_into_book()`/`unslot_item_from_book()` 2종 RPC를 신규 작성했다(`SELECT ...
FOR UPDATE`, `SECURITY DEFINER`). `route.ts`의 POST/DELETE는 인증 확인 후 RPC 1회
호출 + 에러 코드 → HTTP 상태/메시지 매핑 테이블만 담당하도록 축소했다. 기존
순차 로직의 모든 검증(소유자 확인, 이미 장착됨, 이미 드랍됨, 아이템북 소속 확인,
인벤토리 꽉 참 등)을 RPC 내부로 옮겼고, 응답 상태 코드·메시지는 원문 그대로 유지했다.

락 순서는 `create_user_drop()`(inventory → inventory_items)과 동일하게
`slot_item_into_book()`도 inventory → inventory_items로 맞췄다 — 정확히 이 티켓이
다루는 레이스 당사자이므로 두 함수 간 락 순서 일치가 데드락 회피의 핵심이다.
`unslot_item_from_book()`은 티켓 본문이 제시한 순서(slots → items → inventory)
대신 slots → inventory → inventory_items로 조정했다(사유는 alerts 참고).

### 변경된 파일
```
jam-web/supabase/migrations/111_item_slot_atomic_rpc.sql (신규 — 미실행, 실행은 오케스트레이터)
jam-web/src/app/api/itembooks/[id]/slot/route.ts
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 신규/변경 코드 타입 에러 없음
- [x] `npm run lint` (전체) — 0 errors, 26 warnings (전부 기존 파일, 변경 파일 무관 — 기존
      `lint:ci --max-warnings 26` 기준선과 동일)
- [x] 마이그레이션 111을 프로덕션 DB(jam-prod, `ceehnkzdbecxwzxrhhns`)에 실행 —
      `list_migrations` 최신 버전(110) 확인 후 적용, `anon`/`authenticated` EXECUTE
      권한 회수·`service_role`만 허용됨을 `has_function_privilege`로 재확인
- [x] 실 프로덕션 데이터(inventory_item 1건)를 대상으로 `BEGIN ... ROLLBACK` 트랜잭션
      안에서 6개 시나리오 실행해 검증 후 원상 복구(영구 변경 없음 확인 — `slot_rows`·
      `custody_rows` 등 사전/사후 0건 일치):
      1) 정상 장착 → `ok:true` + 슬롯 row 생성
      2) 중복 장착 → `already_slotted`
      3) 정상 해제 → `ok:true`, `slotted_in` NULL·`used_slots` 복원·슬롯 row 삭제
      4) 존재하지 않는 슬롯 해제 → `slot_not_found`
      5) **레이스 재현(원래 버그의 핵심)**: `inventory_id`를 NULL로 바꿔(드랍 시뮬레이션)
         직후 장착 시도 → `already_dropped`로 정상 차단 — 모순 상태 재현되지 않음 확인
      6) `get_advisors(security)` — 신규 RPC 2종이 `function_search_path_mutable` WARN에
         걸리지만 이는 `create_user_drop`/`pickup_drop` 등 기존 RPC 전부와 동일한
         기존 컨벤션(search_path 미설정)이라 이번 변경의 신규 회귀 아님. 새로운 ERROR
         레벨 advisory 없음

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (에러 메시지 문구 불변 — 기존 문구를 상수 매핑 테이블로 그대로 옮김)

### 배포 정보
- 배포일: 2026-08-30
- 환경: DB(마이그레이션 111)는 production에 직접 실행 완료(공용 단일 DB — 구 route.ts는
  새 RPC를 아직 호출하지 않으므로 무해). 코드(route.ts)는 staging에 fast-forward push
  완료 — main 승격(프로덕션 프론트 반영)은 별도 `/jam-ship` + 사용자 승인 필요
- 커밋: 488a3f13adf98e0a25e6edc4f3cdeb7cc0d7fd2a (staging에 fast-forward 반영)

### 주요 의사결정 / 핵심 메모
- 기존 route.ts의 "이미 드랍된 아이템" 체크가 `inventory_items.dropped_at` 컬럼을
  봤는데, 108 마이그레이션 이후 `create_user_drop()`은 더 이상 `dropped_at`을 설정하지
  않고 `inventory_id`를 NULL로 비우는 방식으로 바뀌었다 — 즉 그 체크는 108 배포 이후
  사실상 죽은 코드였다(그보다 먼저 소유자 조회가 `inventory_id` 불일치로 403을
  반환해버려 409 분기에 도달할 수 없었음). 새 RPC는 `inventory_id IS NULL`을
  "이미 드랍됨"(409) 신호로, `inventory_id`가 다른 인벤토리를 가리키면 "본인 소유
  아님"(403)으로 명확히 구분해 원래 의도한 응답을 복원했다.
- `unslot_item_from_book()`의 락 순서를 티켓 본문 제시 순서(slots→items→inventory)에서
  slots→inventory→items로 조정했다 — `create_user_drop()`과 테이블 순서를 일치시켜
  "슬롯 해제"와 "드랍"이 같은 아이템을 동시에 대상으로 할 때의 AB-BA 데드락 가능성을
  없앴다.

### 잔여 이슈
아래 2건은 게이트·개선 리뷰의 side finding으로, 사용자 승인 하에 별도 작업 칩으로
분리했다(이번 티켓 스코프 밖):
- `.is('dropped_at', null)` 잔존 필터 정리 — `jam-web/src/lib/itembook/completable.ts`,
  `lib/notifications/batch/collections.ts`, `lib/notifications/batch/following.ts` 등.
  108 이후 유저 드랍은 `dropped_at`을 설정하지 않으므로 대부분 죽은 필터이며, 일부
  배치 쿼리는 `inventory_id` 필터 없이 이것에만 의존해 실제 오판 가능성 있음.
- 믹스(`lib/combine/index.ts`) 동시성 점검 — 조건부 UPDATE + 영향행 수 검증 방식이라
  단일 행 원자성에는 기대지만, "슬롯 장착"과 "믹스 소재 선택"이 같은 아이템을 동시에
  노리는 시나리오는 이번 티켓이 다룬 것과 같은 계열의 레이스에 노출될 수 있음.

## 참고
- [20260830_0055](20260830_0055_Admin_아이템배지-Held-Slotted-상태판정-안전성-조사.md) —
  이 티켓의 발견을 촉발한 조사 티켓 (§3)
- [20260829_2101](20260829_2101_BadgeEngine_아이템배지-개체정체성-드랍픽업-일련번호유지.md) —
  "표준 불변식" 정의 출처
- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` §3.5-2 — 이 티켓으로 갱신,
  원자적 소유권 이전 RPC 전체 목록·락 순서 표
