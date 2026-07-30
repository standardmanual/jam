# JAM! Phase 14 구현 단계 — 드랍 메뉴 개선

> 작성일: 2026-07-25

---

## Step A: 인벤토리 그리드 공용 컴포넌트 추출

- `src/app/(main)/inventory/page.tsx`에 인라인으로 있는 3열 그리드 카드 UI(희귀도별 배경색 `rarityCardBg`, 만료 임박 표시, 빈 슬롯 placeholder)를 `src/components/inventory/InventoryGrid.tsx`로 추출.
- `mode: 'navigate' | 'select'` prop 추가 (Phase14_02_DATA_MODEL §3 스펙대로). `navigate`는 기존과 동일하게 `/inventory/[itemId]`로 이동, `select`는 `onSelect(item)` 콜백 호출.
- `/inventory/page.tsx`는 이 컴포넌트를 `mode="navigate"`로 사용하도록 교체 — **동작 회귀 없어야 함**(슬롯 프로그레스바, 만료 임박 표시 등 기존 그대로).

**완료 기준**: `/inventory` 페이지 시각적·기능적으로 기존과 동일, 그리드 부분만 별도 컴포넌트로 분리됨.

## Step B: `/drops` 화면 레이아웃 — 타이틀 제거 + 풀스크린

- `src/app/(main)/drops/DropsClient.tsx`: 헤더("드랍 · 픽업" 타이틀), 모드 탭(drop/pickup 토글) 컴포넌트/상태(`mode` state) 전부 제거.
- 지도 컨테이너를 카드형 래퍼(둥근 모서리·테두리·그림자·여백)에서 `100dvh` 풀스크린으로 변경.
- 필요 시 최소한의 뒤로가기 버튼만 지도 위 오버레이로 유지(옵션).

**완료 기준**: `/drops` 진입 시 타이틀·모드탭 없이 지도가 화면 전체를 채움.

## Step C: POI 클릭 → 상태 분기 바텀시트

- 기존 `select_item` 스텝 로직을 대체하는 신규 통합 바텀시트 컴포넌트(`PoiBottomSheet` — `DropsClient.tsx` 내부 또는 별도 파일로 분리, 파일 길이 보고 판단).
- POI 클릭 시 항상 `GET /api/drops/poi/[poiId]`를 먼저 호출:
  - `drops.length === 0` → 드랍 상태 UI (Step D)
  - `drops.length > 0` → 픽업 상태 UI (Step E), 배지 여러 개면 전부 리스트로 노출
- 기존 인벤토리 사전 로드(`GET /api/inventory/items`) 호출 시점은 드랍 상태로 분기된 이후로 늦춤(불필요한 API 호출 방지).

**완료 기준**: 배지 없는 POI와 있는 POI를 각각 클릭했을 때 올바른 UI로 분기됨.

## Step D: 드랍 플로우 UI

- 드랍 상태 바텀시트: "아직 아이템이 없어요" 안내 + `[드랍]` 버튼.
- `[드랍]` 클릭 → `InventoryGrid`(Step A, `mode="select"`) 오픈 — 보유 아이템배지 카드 목록.
- 카드 선택 → 확인 다이얼로그("'{배지명}'을 여기에 드랍하시겠습니까?") — 기존 `window.confirm()` 대신 인앱 확인 UI 사용(2026-07-24 미션 참가 버그 수정과 동일한 이유 — [SERVICE_OPERATIONS_20260724_1954.md] 참고, 모바일에서 연속 confirm() 호출 시 무반응 문제 재발 방지).
- 확인 → 기존 `POST /api/drops` 그대로 호출.
- 성공 → 바텀시트가 "드랍 완료" 상태로 전환, 방금 드랍한 배지 카드 표시.

**완료 기준**: 드랍 전 과정이 새 UI 흐름으로 정상 동작, API 호출/검증 로직은 기존과 동일.

## Step E: 픽업 플로우 UI

- 픽업 상태 바텀시트: POI가 보유한 배지 목록(여러 개 가능) 카드/리스트로 표시.
- 항목 클릭 → 배지 상세 오버레이(`BadgeDetailSheet` 신규 — 기존 `/badges/[id]` 페이지의 이미지/이름/희귀도/설명 레이아웃을 시트 형태로 재사용. 페이지 이동이 아니라 오버레이라는 점만 다름) + 하단 `[픽업]`/`[취소]` 버튼.
- `[픽업]` → 기존 `POST /api/drops/[dropId]/pickup` 그대로 호출.
- 성공 → 상세 오버레이 닫고 POI 바텀시트로 복귀, 목록에서 픽업한 항목 제거. 남은 배지가 없으면 자동으로 드랍 상태(Step D)로 전환.

**완료 기준**: 배지 여러 개인 POI에서 하나씩 픽업할 때마다 목록이 정확히 갱신되고, 전부 픽업하면 드랍 상태로 바뀜.

## Step F: 검증 + 문서

- `npx tsc --noEmit` 0 에러.
- 회귀 확인: 기존 드랍/픽업 API의 50m 반경 검증, 어뷰징 탐지(`src/lib/abusing/`)가 그대로 동작하는지 확인(로직 변경 없음이 목표).
- `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성((main) 화면 변경 해당).
- commit + push

---

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 배지 종류/희귀도별 마커 색상 세분화 | 유저 피드백으로 필요성 확인되면 |
| POI 위 배지 개수 숫자 뱃지 | 위와 동일 |
| 지도 클러스터링/성능 최적화 | POI 밀도 높은 지역 운영 데이터 쌓이면 |
