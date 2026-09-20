# JAM! 서비스 운영 문서 — 변경분 (2026-07-21 21:52)

> **이 버전의 변경 내용:** 홈/프로필 피드 중복 표시 버그 수정 — 아이템 드랍·POI 픽업 중복 제거 키가 실제로는 한 번도 기록되지 않던 결함 수정 (DB 오염 아님, 재초기화 불필요)  
> 이전 버전: SERVICE_OPERATIONS_20260721_2134.md

---

## [버그 수정] 피드 중복 표시 (`(main)/page.tsx`, `(main)/[username]/page.tsx`)

### 원인

홈/프로필 피드는 `user_activity_feed`(실기록) + `inventory_items`/`poi_drops` 원본 테이블에서 재구성한 "레거시 항목"을 합쳐서 보여준다. 후자는 전자와 중복되지 않도록 메타데이터의 식별자로 걸러내야 하는데:

- **아이템 드랍**: 중복 제거 키로 `metadata.__legacy_item_id`를 읽고 있었으나, 드랍엔진(`drop-engine/index.ts`)의 `recordFeedEvent` 호출은 이 필드를 **한 번도 기록한 적이 없었음** — 항상 매칭 실패 → 모든 드랍이 실기록 1건 + 레거시 합성 1건, 총 2건으로 표시됨.
- **POI 픽업**: 홈 페이지는 아예 중복 제거 로직이 없었고, 프로필 페이지는 `feedPickupDropIds`에 값을 채우기만 하고 실제 비교에 쓰지 않는 죽은 코드였음 — 모든 픽업이 항상 2건으로 표시됨.

DB에는 중복 행이 쌓인 게 아니라, **화면 렌더링 시점에 매번 중복을 합성**하는 조회 로직 버그였다.

### 수정

| 항목 | 변경 |
|------|------|
| `src/lib/drop-engine/index.ts` | `inventory_items` INSERT 후 `.select('id')`로 생성된 행 id를 받아 `recordFeedEvent`의 `inventory_item_id`로 전달 |
| `src/app/api/drops/[dropId]/pickup/route.ts` | `recordFeedEvent`에 `poi_drop_id: dropId` 추가 |
| `src/lib/activity-feed/index.ts` | `FeedEventMeta`에 `inventory_item_id?`(item_dropped), `poi_drop_id?`(item_picked_up) 필드 추가 |
| `(main)/page.tsx`, `(main)/[username]/page.tsx` | 드랍 중복 제거 키를 `__legacy_item_id` → `inventory_item_id`로 교체, 픽업 중복 제거를 실제로 동작하도록 수정 |

### 운영 유의사항

- **재초기화 불필요**: 렌더링 로직 버그라 배포 즉시 기존 계정(sihyunrr@gmail.com 포함)의 중복 표시가 사라진다.
- **`combine`(조합) 결과 아이템은 현재 피드에 전혀 표시되지 않음** (별도 결함, 이번 수정 범위 아님) — `combine/index.ts`가 `recordFeedEvent`를 호출하지 않고, `obtained_by='system_event'`라 레거시 드랍 합성(`obtained_by='drop'` 필터)에도 걸리지 않음. 후속 확인 필요.
- `src/lib/drop/pickup.ts`의 `processDropPickups`는 어디서도 호출되지 않는 죽은 코드 — 별도 정리 대상.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260721_2134.md)과 동일.
