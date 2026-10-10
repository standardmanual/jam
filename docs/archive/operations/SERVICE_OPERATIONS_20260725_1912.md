# JAM! 서비스 운영 문서 — 변경분 (2026-07-25 19:12)

> **이 버전의 변경 내용:** 배지 메뉴 > 아이템 탭에서 아이템배지 상세로 진입 시 하단 탭바가 "인벤토리"로 잘못 활성화되던 버그 수정.
> 이전 버전: SERVICE_OPERATIONS_20260725_1905.md

---

## 버그 수정: 아이템배지 상세 진입 시 하단 탭 활성 상태 오류

**관련 파일:** `src/app/(main)/TabBar.tsx`, `src/app/(main)/badges/BadgesClient.tsx`

- **문제**: 아이템배지 상세 화면은 배지 메뉴(`/badges`)와 인벤토리 메뉴(`/inventory`) 양쪽에서 진입 가능하지만, 실제 라우트는 `/inventory/[itemId]` 하나뿐(별도의 `/badges/items/[id]` 같은 경로 없음). `TabBar`의 `isActive()`는 `pathname.startsWith(href)`로만 판단하므로, 배지 메뉴에서 들어가도 URL이 `/inventory/...`인 이상 무조건 "인벤토리" 탭이 활성화됐다.
- **수정**: `BadgesClient.tsx`의 아이템 배지 카드 링크에 `?from=badges` 쿼리를 추가(`/inventory/${itemId}?from=badges`). `TabBar.tsx`는 `pathname.startsWith('/inventory') && searchParams.get('from') === 'badges'`일 때 "배지" 탭만 활성화하도록 `isActive()`에 분기 추가. 기존 `viewingOtherUser`(`?u=` 쿼리로 다른 유저 프로필 맥락 판별) 패턴과 동일한 방식.
- 인벤토리 메뉴에서 직접 들어간 경우(쿼리 없음)는 기존과 동일하게 "인벤토리" 탭이 활성화됨 — 회귀 없음.
