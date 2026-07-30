# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** Phase14 드랍 메뉴 개선 — `/drops` 모드탭 제거 + POI 상태 기반 단일 플로우(드랍/픽업 자동 분기) + 풀스크린 지도 + 인벤토리 그리드 공용 컴포넌트화. **API/DB 로직 변경 없음(프런트엔드 UI 재구성 only).**
> 이전 버전: SERVICE_OPERATIONS_20260725_1542.md

> 현재 운영 중인 코드 기준으로 작성된 기술 운영 문서.  
> 최종 업데이트: 2026-07-25

---

> 아래는 이번 변경으로 갱신된 섹션만 수록한다. 그 외 섹션은 직전 버전(SERVICE_OPERATIONS_20260725_1542.md)과 동일하다.

---

## 6. POI 드랍 · 픽업

**관련 파일:**
- 서버(변경 없음): `src/lib/drop/pickup.ts`, `src/app/api/drops/route.ts`, `src/app/api/drops/poi/[poiId]/route.ts`, `src/app/api/drops/[dropId]/pickup/route.ts`, `src/lib/abusing/`
- 화면(Phase14 재구성): `src/app/(main)/drops/DropsClient.tsx`, `src/app/(main)/drops/BadgeDetailSheet.tsx`(신규), `src/components/inventory/InventoryGrid.tsx`(신규), `src/app/(main)/inventory/page.tsx`

### 6-0. 드랍 메뉴 화면 흐름 (Phase14 — POI 상태 기반 단일 플로우)

기존에는 화면 상단에 **드랍 / 픽업 모드 탭**이 있어 유저가 먼저 모드를 골라야 했다. Phase14부터 **모드 탭·헤더 타이틀을 완전히 제거**하고, 지도를 풀스크린으로 사용한다. 유저는 모드를 고르지 않고 곧바로 POI를 누르며, 시스템이 그 POI의 배지 보유 상태로 화면을 자동 분기한다.

```
1. /drops 진입 → 타이틀·모드탭 없이 지도가 화면 전체(하단 네비 제외)를 채움
2. POI 마커 클릭
   → in_drop_range=false(50m 밖)면 안내 토스트만 표시하고 종료 (기존 근접 게이트 유지)
   → in_drop_range=true면 GET /api/drops/poi/[poiId]를 먼저 호출해 상태 판별
        drops.length === 0  → 드랍 상태 UI (6-0-A)
        drops.length  >  0  → 픽업 상태 UI (6-0-B)
```

- 지도 마커 색상 로직은 기존과 동일: `available_drops_count > 0` → 초록(source 무관, 앰비언트 포함), 반경 내 드랍 없음 → 회색, 반경 밖 → 흐림. 배지 종류/개수별 세분화 없음.
- 인벤토리 아이템 사전 로드(`GET /api/inventory/items`)는 [드랍] 버튼을 누른 이후로 지연 호출(불필요한 API 호출 방지).

**A. 드랍 상태 (배지 없는 POI)**
```
1. 바텀시트: "아직 아이템이 없어요" + [여기에 드랍하기] 버튼
2. 버튼 클릭 → GET /api/inventory/items 지연 로드 → InventoryGrid(mode="select") 표시
3. 카드 선택 → 인앱 확인 UI(카드 안 [취소]/[드랍하기] 2버튼) — 네이티브 confirm() 미사용
4. [드랍하기] → POST /api/drops (기존, 50m 검증 등 그대로)
5. 성공 → 해당 POI 목록을 재조회해 방금 드랍한 배지를 바텀시트에 노출(픽업 상태로 전환) + 지도 갱신
```

**B. 픽업 상태 (배지 있는 POI)**
```
1. 바텀시트: 그 POI에 있는 배지 목록(여러 개면 전부 나열, 클릭 가능한 카드)
2. 항목 클릭 → BadgeDetailSheet 오버레이(/badges/[id] 스타일 재사용, 페이지 이동 아닌 시트 → 지도 상태 보존)
   + 하단 [픽업하기]/[취소]
3. [픽업하기] → POST /api/drops/[dropId]/pickup (기존, 50m·GPS조작 검증 그대로)
4. 성공 → 오버레이 닫고 목록에서 픽업한 항목 제거. 남은 배지 있으면 계속 노출, 없으면 자동으로 드랍 상태(A)로 전환
```

> 한 POI에 배지 여러 개 동시 존재는 기존 `poi_drops`(POI당 다중 행 허용) 그대로 충족 — 스키마 변경 없음.

### 6-1. POI 드랍 이벤트 (drop_events)  *(변경 없음)*

```
사용자가 직접 POI에 드랍:
1. 인벤토리에서 아이템 선택
2. API 호출 → inventory_items.dropped_at = now, drop_id = poi_drop.id
3. poi_drops INSERT { dropper_user_id, badge_id, poi_id, is_available: true }
4. inventory.used_slots -= 1
5. recordFeedEvent: 'item_dropped'
```

### 6-2. POI 픽업 흐름  *(변경 없음)*

```
POST /api/drops/[dropId]/pickup → pickup_drop RPC (DB 원자 트랜잭션):
사전 검증: 50m 근접 · poi_blocks · GPS 조작 감지 · is_available · 본인 드랍 픽업 불가 · 슬롯 여유
처리: poi_drops picked_up 갱신 + inventory_items INSERT + used_slots += 1 + recordFeedEvent
```

---

## 7. 인벤토리 · 아이템북

**관련 파일:** `src/app/api/itembooks/[id]/slot/route.ts`, `src/lib/itembook/checker.ts`, `src/components/inventory/InventoryGrid.tsx`(신규)

### 7-0. 인벤토리 그리드 공용 컴포넌트 (Phase14)

`/inventory` 페이지에 인라인으로 있던 3열 그리드 카드 UI를 `src/components/inventory/InventoryGrid.tsx`로 추출해 단일 진실 소스로 만들었다. `/inventory` 페이지와 드랍 바텀시트가 같은 컴포넌트를 `mode` prop으로만 분기해 사용한다.

```
InventoryGridProps:
  items: InventoryGridItem[]   // 정규화 형태 { id, badgeName, badgeImageUrl, badgeRarity, expiresAt? }
                                //  - /inventory: InventoryItemRow & {badge} → 매핑
                                //  - 드랍 시트: GET /api/inventory/items(플랫 응답) → 매핑
  mode: 'navigate' | 'select'  // navigate: /inventory/[id] 이동(기존 동작) · select: onSelect(item) 콜백
  onSelect?, emptySlots?, selectedItemId?
```

- 희귀도별 카드 배경색, 만료 임박(7일 이내) 표시, 빈 슬롯 placeholder는 기존 그대로 유지.
- 필터 규칙 승계: 드랍됨(`dropped_at`)·아이템북 장착(`slotted_in`) 아이템은 그리드에 노출하지 않음.

### 7-1. 인벤토리 구조  *(변경 없음)*

```
inventory (유저당 1개) — max_slots 기본 50, used_slots
inventory_items (슬롯당 1개) — badge_id, obtained_by, expires_at(+30일), dropped_at, slotted_in
```
