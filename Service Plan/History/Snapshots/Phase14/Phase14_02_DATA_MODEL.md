# JAM! Phase 14 데이터 모델 — 드랍 메뉴 개선

> 작성일: 2026-07-25

---

## 1. 결론 먼저 — DB 스키마 변경 없음

코드 조사 결과, 이번 Phase에서 요구하는 동작은 **기존 스키마·API로 이미 대부분 충족**된다. 신규 마이그레이션 불필요.

| 요구사항 | 기존 지원 여부 |
|----------|----------------|
| POI 하나에 배지 여러 개 동시 존재 | ✅ `poi_drops`는 애초에 POI당 여러 행 허용 (1:N), 별도 UNIQUE 제약 없음 |
| 앰비언트(시스템) 드랍도 지도에 초록 표시 | ✅ `GET /api/drops`의 `available_drops_count` 집계가 `source` 구분 없이 `is_available=true`인 모든 `poi_drops`를 카운트 — 이미 앰비언트 포함됨 |
| POI별 배지 목록 조회(픽업용) | ✅ `GET /api/drops/poi/[poiId]`가 이미 배열로 반환 (`is_ambient` 플래그 포함) |
| 드랍/픽업 실행 | ✅ `POST /api/drops`, `POST /api/drops/[dropId]/pickup` 그대로 재사용 |

**변경이 필요한 것은 프런트엔드 컴포넌트 구조뿐** — 모드탭 제거, 인벤토리 그리드 공용화, POI 상태 기반 분기 UI.

## 2. 기존 테이블 (참고, 변경 없음)

### `poi_drops`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `dropper_user_id` | UUID, nullable | 유저 드랍이면 드랍한 유저, 앰비언트면 NULL |
| `poi_id` | UUID | 대상 POI |
| `badge_id` | UUID | 드랍된 배지 |
| `source` | TEXT | `'user'` \| `'system'`(앰비언트) |
| `is_available` | BOOLEAN | 픽업 가능 여부(픽업되면 false) |
| `dropped_at` | TIMESTAMPTZ | |
| `picked_up_by`/`picked_up_at` | nullable | 픽업 기록 |

### `inventory_items` (드랍 대상 아이템 소스)

| 컬럼 | 설명 |
|------|------|
| `dropped_at`/`drop_id` | 드랍되면 채워짐(논리 삭제 — 인벤토리 목록에서 제외됨) |
| `slotted_in` | 아이템북 장착 중이면 드랍 대상에서 제외(기존 `/inventory` 필터 로직과 동일하게 드랍 그리드에도 적용) |

## 3. 프런트엔드 데이터 흐름 (신규 컴포넌트 구조)

```
DropsClient (모드탭 제거, 지도 풀스크린)
  └── MapView (마커 색상 로직 변경 없음 — available_drops_count > 0 → 초록)
  └── PoiBottomSheet (신규 통합 컴포넌트, 기존 select_item 스텝 대체)
       ├── GET /api/drops/poi/[poiId] 호출 결과로 상태 분기
       │     drops.length === 0  → DropStep
       │     drops.length  >  0  → PickupStep
       ├── DropStep
       │     └── InventoryGrid (공용 컴포넌트, selectable 모드) ← 신규 추출
       │           onSelect(item) → 확인 다이얼로그 → POST /api/drops
       └── PickupStep
             └── 배지 목록(여러 개 가능) → 클릭 시 BadgeDetailSheet
                   └── BadgeDetailSheet (기존 /badges/[id] 스타일 재사용)
                         [픽업] → POST /api/drops/[dropId]/pickup
```

### `InventoryGrid` 공용 컴포넌트 props (신규)

```typescript
interface InventoryGridProps {
  items: InventoryItemRow[]           // 이미 필터링된 목록(드랍/장착 제외)
  mode: 'navigate' | 'select'         // navigate: 기존 /inventory 동작(상세 페이지 이동)
                                        // select: 드랍 바텀시트용(onSelect 콜백)
  onSelect?: (item: InventoryItemRow) => void   // mode='select'일 때 필수
}
```

- `/inventory/page.tsx`: `mode="navigate"`로 기존 동작 그대로 유지.
- 드랍 바텀시트: `mode="select"`로 사용, 카드 클릭 시 페이지 이동 대신 확인 다이얼로그 오픈.

## 4. API 변경 사항

**변경 없음.** 다만 `GET /api/drops/poi/[poiId]`를 이번엔 "픽업 모드일 때만"이 아니라 **POI 클릭 시 항상 먼저 호출**해 상태를 판별하는 용도로 쓰임이 확장된다(호출 시점 변경, 응답 스키마 변경 없음).
