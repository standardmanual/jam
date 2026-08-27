---
id: 20260805_001
category: Refactor
status: CLOSED
created: 2026-08-05
closed: 2026-08-07
---

# [Refactor] InventoryGrid 컴포넌트 추출

## 배경
Phase 14 드랍 메뉴 개편 시 인벤토리 그리드를 재사용 가능한 컴포넌트로 분리.

## 상세 요구사항
- InventoryGrid.tsx (3열 그리드, 슬롯 상태 표시)
- InventoryItem.tsx (아이템 카드, 클릭 핸들)
- Props: items[], onSelect, selectedItemId, isSelectable()

---

## 완료 기록

### 구현 내용 요약
- 인벤토리 그리드 컴포넌트 분리

### 변경된 파일
```
src/components/inventory/InventoryGrid.tsx (신규)
src/components/inventory/InventoryItem.tsx (신규)
```

### 배포 정보
- 배포일: 2026-08-07
- 커밋: refactor/inventory_components
