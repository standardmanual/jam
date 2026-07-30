# JAM! 서비스 운영 문서 — 변경분 (2026-07-26 14:24)

> **이 버전의 변경 내용:** 아이템배지 상세 ↔ 아이템북 상세 화면 상호 링크 추가(왕복 네비게이션).
> 이전 버전: SERVICE_OPERATIONS_20260726_1117.md

---

## 아이템배지 상세 → 아이템북 상세 링크 + 뒤로가기 왕복

**관련 파일:** `src/app/(main)/inventory/[itemId]/page.tsx`, `src/app/(main)/itembooks/[id]/page.tsx`

- **아이템배지 상세**(`/inventory/[itemId]`): 배지의 `item_book_id`로 연결된 아이템북을 조회해 "속한 아이템북" 카드 추가. 클릭 시 `/itembooks/{id}?from=badge&itemId={itemId}`로 이동(연결된 아이템북이 없으면 카드 자체 미노출).
- **아이템북 상세**(`/itembooks/[id]`): `from=badge&itemId=...` 쿼리로 진입한 경우 상단 뒤로가기 링크가 기존 "아이템북 목록"(`/itembooks`) 대신 `/inventory/{itemId}`(그 배지 상세)로 이동하도록 분기, 라벨도 "배지 상세"로 변경. 그 외 경로(목록에서 진입, 타인 프로필 `?u=`)는 기존 동작 그대로 — 회귀 없음.
- 배지 메뉴 진입 시 하단 탭 활성화를 유지하던 `?from=badges` 패턴(2026-07-25)과 동일한 방식으로, URL 쿼리로 진입 출처를 표시해 뒤로가기 목적지를 다르게 처리.
