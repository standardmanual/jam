# JAM! Phase 14 프로젝트 스펙 — 드랍 메뉴 개선

> 작성일: 2026-07-25

---

## 1. 기술 스택 (기존 유지)

기존 드랍/픽업 시스템(`src/app/(main)/drops/`, `src/app/api/drops/`, `src/lib/abusing/`) 패턴 그대로. 신규 스택 도입 없음. DB 마이그레이션도 없음(Phase14_02_DATA_MODEL §1 참고).

## 2. 파일 구성

```
[신규 컴포넌트]
src/components/inventory/InventoryGrid.tsx     # 인벤토리 3열 그리드 카드 UI 공용 컴포넌트 (신규)
src/app/(main)/drops/PoiBottomSheet.tsx        # POI 클릭 시 상태 분기 바텀시트 (신규, 또는 DropsClient.tsx 내부 유지 — 파일 길이 보고 판단)
src/app/(main)/drops/BadgeDetailSheet.tsx      # 픽업용 배지 상세 오버레이 (신규, /badges/[id] 스타일 재사용)

[수정]
src/app/(main)/inventory/page.tsx              # InventoryGrid(mode="navigate") 사용하도록 교체
src/app/(main)/drops/DropsClient.tsx           # 모드탭 제거, 풀스크린 레이아웃, PoiBottomSheet로 교체
src/app/(main)/drops/page.tsx                  # 타이틀 관련 마크업 제거(있다면)

[변경 없음 — 그대로 재사용]
src/app/api/drops/route.ts                     # GET(지도 POI+카운트), POST(드랍)
src/app/api/drops/poi/[poiId]/route.ts         # GET(POI별 배지 목록) — 호출 시점만 확장
src/app/api/drops/[dropId]/pickup/route.ts     # POST(픽업)
src/lib/abusing/                                # 어뷰징 탐지 로직
src/lib/poi/                                    # 근접 판정(proximity.ts) 등
```

## 3. 구현 규칙

- **API/서버 로직은 건드리지 않는다** — 이번 Phase는 프런트엔드 UI 재구성이 전부. 50m 반경 검증, 어뷰징 탐지, `poi_drops`/`inventory_items` 처리 로직에 손대지 않는다.
- **`InventoryGrid`는 단일 진실 소스** — `/inventory` 페이지와 드랍 바텀시트가 같은 컴포넌트를 쓰되 `mode` prop으로만 동작을 분기한다. 두 곳에 비슷한 그리드 UI를 따로 만들지 않는다.
- **POI 상태 판별은 `GET /api/drops/poi/[poiId]` 응답의 `drops.length`로만** — 별도의 "이 POI는 드랍 가능/픽업 가능" 플래그를 새로 만들지 않는다.
- **네이티브 `confirm()`/`alert()` 금지** — 드랍 확인 다이얼로그는 반드시 인앱 확인 UI(버튼 2개짜리 인라인 카드 등)로 구현한다. 모바일/PWA에서 연속 호출 시 브라우저가 조용히 차단하는 문제가 실제로 발생했었다(2026-07-24, 미션 참가 버그).
- **앰비언트 드랍을 구분 표시하지 않는다** — 지도 마커, POI 배지 목록 모두 `source`(user/system) 값으로 색상이나 배지를 다르게 표시하지 않는다. `GET /api/drops/poi/[poiId]` 응답에 이미 `is_ambient` 필드가 있지만 이번 Phase의 UI에서는 사용하지 않는다(향후 확장 여지로 필드만 유지).
- **인벤토리 목록 필터링 규칙은 기존 그대로 승계** — 이미 드랍된 아이템(`dropped_at` not null), 아이템북에 장착된 아이템(`slotted_in` not null)은 `InventoryGrid`에도 노출하지 않는다.
- **배지 상세 오버레이는 페이지 이동이 아닌 시트/모달** — 픽업 플로우 중 URL이 `/drops`에서 벗어나지 않아야 한다(뒤로가기 시 지도 상태 보존).

## 4. 절대 하지 마

- 드랍/픽업 API의 반경 검증·어뷰징 탐지 로직 변경 — 이번 범위는 UI 재구성뿐
- `poi_drops`/`inventory_items` 스키마 변경 — 기존 구조로 전부 충족됨(Phase14_02_DATA_MODEL §1)
- 인벤토리 그리드 UI를 드랍 바텀시트용으로 별도 새로 만들기 — 반드시 공용 컴포넌트 추출 후 재사용
- 네이티브 `window.confirm()`/`window.alert()` 사용
- 배지 종류/희귀도별 마커 색상 세분화, POI 배지 개수 숫자 뱃지 구현 — Phase 2 범위

## 5. 완료 체크리스트

- [ ] Step A: 인벤토리 그리드 공용 컴포넌트 추출 (`/inventory` 회귀 없음)
- [ ] Step B: `/drops` 타이틀·모드탭 제거, 풀스크린 지도
- [ ] Step C: POI 클릭 시 상태 분기 바텀시트
- [ ] Step D: 드랍 플로우(인벤토리 그리드 선택 → 인앱 확인 → 드랍)
- [ ] Step E: 픽업 플로우(배지 목록 → 상세 오버레이 → 픽업)
- [ ] Step F: tsc 0 에러 + SERVICE_OPERATIONS 문서 + commit/push
