# JAM! 서비스 운영 문서 — 변경분 (2026-07-25 19:05)

> **이 버전의 변경 내용:** `/api/inventory/items`(드랍 후보 목록)가 아이템북 슬롯에 장착된 배지를 걸러내지 않던 버그 수정.
> 이전 버전: SERVICE_OPERATIONS_20260725_1856.md

---

## 버그 수정: 드랍 후보 목록에서 아이템북 장착 배지 누락 필터

**관련 파일:** `src/app/api/inventory/items/route.ts`

- **문제**: `GET /api/inventory/items`(Phase14 드랍 플로우에서 `InventoryGrid`에 표시할 후보 목록 조회용)가 `inventory_items.dropped_at IS NULL`만 필터링하고 `slotted_in`(아이템북 슬롯 장착 여부)은 확인하지 않았다. `/inventory` 페이지는 `dropped_at === null && slotted_in === null` 두 조건 모두로 필터링하는데, 드랍용 API에는 두 번째 조건이 빠져 있어 이미 아이템북에 장착한 배지도 드랍 화면의 인벤토리 그리드에 노출되고 있었다.
- **수정**: 쿼리에 `.is('slotted_in', null)` 조건 추가 — `/inventory` 페이지와 동일한 필터 규칙으로 통일.
- 이 API는 `src/app/(main)/drops/DropsClient.tsx`의 드랍 플로우(`openInventory()`)에서만 사용되므로 다른 화면에 미치는 영향 없음.
