---
id: 20260915_0912
category: BadgeEngine
priority: P1
status: CLOSED
created: 2026-09-15
closed: 2026-09-15
---

# [BadgeEngine] 아이템배지 폐기 처리 — inventory_id 미해제 정정

## 배경 / 문제 정의

사용자가 티켓 [20260914_1945](../P1-중요/20260914_1945_BadgeEngine_미션보상아이템배지-드랍유출-회수및제외설정.md)의
폐기 처리 후 본인 계정(sihyunrr@gmail.com) 인벤토리에 해당 배지가 여전히 보인다고 확인 요청.

조사 결과 20260914_1945에서 6개체를 폐기할 때 `inventory_items.destroyed_at`만 채우고
`inventory_id`는 그대로 뒀던 것이 원인이었다. 이 코드베이스는 "보유 여부 = `inventory_id IS
NOT NULL`" 관례를 전반에 걸쳐 쓴다(`app/(main)/inventory/[itemId]/page.tsx`의
`if (!itemData.inventory_id) notFound()`, `lib/admin/item-badge-status.ts`의 상태 판정 주석,
`lib/combine/index.ts`가 소각 시 `destroyed_at`과 `inventory_id`를 **함께** 비우는 기존
구현). 인벤토리 목록 화면(`app/(main)/inventory/page.tsx`)은 `inventory.inventory_items(*)`
조인으로 아이템을 가져오는데 이 조인이 `inventory_id` FK를 그대로 타므로,
`inventory_id`가 안 비면 `destroyed_at`과 무관하게 계속 노출된다.

**서비스 코드 결함이 아니라 어제 수기 SQL 작업이 기존 관례를 놓친 것**이다 — combine의 소각
로직은 처음부터 이 관례를 정확히 지키고 있었다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 티켓 20260914_1945에서 폐기한 6개체(kangwonc 3·cheerslovelymate 1·jae_everydae 1·god 1)의
  `inventory_id`를 전부 `NULL`로 정정.
- `destroyed_at`·`custody_events`(`AdminDestroy` 6건, 20260914_1945에서 이미 기록)는 그대로
  유지 — 재기록하지 않는다.
- 코드 변경 없음(기존 관례가 옳고, 이번 수기 작업만 그 관례를 어겼던 것).

### UI/UX 관점 (해당 시)
- 정정 후 4개 계정의 인벤토리 화면에서 해당 배지가 완전히 사라진다(장착 슬롯 2건도 이미
  20260914_1945에서 해제됨).

## 구현 계획
1. `supabase/seed_fix_reclaimed_badges_inventory_id_null_20260915.sql` 작성 —
   대상 6개체 `inventory_id = NULL` UPDATE
2. Supabase MCP `execute_sql`로 프로덕션 DB에 직접 실행, `RETURNING`으로 6건 전부
   `inventory_id IS NULL` 확인
3. 관련 화면 3곳(`inventory/page.tsx`·`inventory/[itemId]/page.tsx`·
   `api/inventory/items/route.ts`)이 전부 `inventory_id` 기준으로 동작함을 코드로 재확인해
   추가 정정 지점이 없음을 확인

---
## 완료 기록

### 구현 내용 요약
`supabase/seed_fix_reclaimed_badges_inventory_id_null_20260915.sql`을 실행해 20260914_1945에서
폐기한 6개체의 `inventory_id`를 전부 `NULL`로 정정했다. 실행 결과(`RETURNING`) 6건 전부
`inventory_id: null`, `destroyed_at`은 기존 타임스탬프 그대로 유지됨을 확인했다.
`used_slots`는 이 필드와 독립적인 카운터라 20260914_1945에서 이미 올바르게 반영돼 있었고
이번 정정과 무관하다.

관련 화면 3곳을 코드로 대조 확인 — 전부 `inventory_id` 기준으로 "보유 여부"를 판정하고
있어(인벤토리 목록의 조인, 개체 상세의 `notFound()` 가드, 아이템 API의 `.eq('inventory_id',
...)` 필터) 이번 정정 하나로 모든 화면에서 정합하게 사라짐을 확인했다.

### 변경된 파일
```
jam-web/supabase/seed_fix_reclaimed_badges_inventory_id_null_20260915.sql (신규)
```

### 테스트 결과
- [x] 실행 후 `RETURNING`으로 6건 전부 `inventory_id IS NULL` 확인
- [x] 관련 화면 3곳 코드 대조 — 전부 `inventory_id` 기준 판정임을 확인, 추가 정정 지점 없음
- 코드 변경이 없어 lint/typecheck/vitest 대상 없음

### UX Writing 검증
- [x] 해당 없음

### 배포 정보
- 배포일: 2026-09-15 (DB 직접 실행 — 공용 DB라 즉시 프로덕션 반영)
- 환경: production
- 커밋: (SQL 파일 커밋은 별도 push로 처리)

### 주요 의사결정 / 핵심 메모
- **하드 삭제(`DELETE FROM inventory_items`)를 하지 않았다.** `custody_events.inventory_item_id`가
  `ON DELETE CASCADE`라 하드 삭제하면 20260914_1945에서 남긴 `AdminDestroy` 감사 이력까지
  함께 사라진다. 이 프로젝트의 "폐기" 개념은 처음부터 소프트 삭제(§3.5-1 custody 모델의
  `Destroyed` 상태)이고, 화면 노출 여부는 `destroyed_at`이 아니라 `inventory_id`로 결정되는
  구조라 `inventory_id`만 비우면 "완전히 사라진 것"과 사용자 경험상 동일하다. 사용자가 말한
  "완전히 삭제"는 이 상태(눈에 전혀 안 보이고 다시 쓸 수 없음)를 의미한다고 판단했다 — 진짜
  하드 삭제(행 자체 제거, 이력 소멸)를 원하시면 별도로 요청 바란다.

### 잔여 이슈
- 없음
