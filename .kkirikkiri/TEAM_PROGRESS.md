# 진행 상황 (development-phase17)

## 2026-07-31 — 메인세션(팀장): 팀 구성 + 공유 메모리 초기화
- kkirikkiri-development-phase17 팀 구성 완료, dev-server / dev-client / tester 3명에게 태스크 배분 시작

## 2026-07-31 — dev-server: T1 시작
- PRD(Phase17_01_PRD.md) 3-4절 및 TEAM_PLAN 확인 완료
- 작업 대상: `jam-web/src/app/api/poi-badges/route.ts`(신규), `jam-web/src/lib/poi/badge-clustering.ts`(신규)

## 2026-07-31 — dev-server: T1 완료
- 구현 파일 (둘 다 신규, 기존 파일 무수정):
  - `jam-web/src/lib/poi/badge-clustering.ts` — 순수 함수 `clusterPoiBadges` / `gridCellSizeForZoom` / `shouldCluster` / 상수 `CLUSTER_ZOOM_THRESHOLD=13`. DB·네트워크 의존 없음(테스트 가능).
  - `jam-web/src/app/api/poi-badges/route.ts` — `GET /api/poi-badges?swLat&swLng&neLat&neLng&zoom`. `createClient()` 인증 → `createServiceClient()` 조회 패턴은 `/api/drops`와 동일.
- 로직: bbox 내 `linked_badge_id` 있는 POI 조회 → 연결 배지 `type='poi'` + `deleted_at IS NULL` 필터 → zoom>13이면 개별 목록(+`user_poi_badge_earns` 배지 단위 earned 판정), zoom<=13이면 그리드 클러스터 `{lat,lng,count}`만 반환.
- 검증: `npx tsc --noEmit` — 내 담당 신규 파일 관련 에러 0건. (잔여 에러는 ①기존 `__tests__` 파일들의 jest 타입 미설치(사전 존재) ②dev-client의 `/api/share-card` 삭제로 인한 `.next` 스테일 validator 타입 — 둘 다 내 작업과 무관)
- 클러스터링 함수는 tsx로 실제 실행해 셀 크기 단조 증가(z6 5.625° > z10 0.3516° > z13 0.0439°), 서울 2건 병합/부산·제주 분리, 빈 배열·NaN 방어 동작 확인 완료.
- **API 응답 스키마 전문은 `TEAM_FINDINGS.md`에 기록** (dev-client 연동용).
- 커밋은 하지 않음 — dev-client 작업과 동시 진행 중이라 T6 통합 검증 시 팀장이 일괄 커밋하는 것이 안전.

## 2026-07-31 — dev-client: T3 / T4 / T5 완료

### 수정한 파일
- `jam-web/src/lib/i18n/ko.ts`
  - `nav.drops: '드랍'` → `'JAM'` (라우트 `/drops` 및 컴포넌트명은 무변경. 탭 라벨은 `TabBar.tsx`가 `d.nav.drops`를 참조하므로 이 한 줄로 반영됨)
  - 미사용이 된 `badges.shareCard*` 6개 문구 제거
- `jam-web/src/components/map/MapView.tsx` (대폭 개편)
  - 드랍/픽업 마커: `markerIconHtml` → `dropMarkerIconHtml`. 20px 서클(선택 시 26px), 픽업 가능=`var(--color-main)`, 불가=그레이(#888), 범위 밖=진회색(#444)+opacity 0.5(기존 표현 유지). 내부에 하강 화살표 인라인 SVG를 네거티브 컬러(`var(--color-sub)`/흰색)로 렌더.
  - POI 배지 마커 신규: 30px 원형 + `image_url`. 미획득은 `filter:grayscale(1)`이고 **`Event.addListener('click')` 자체를 걸지 않음**(탭 완전 비활성). 획득 시에만 클릭 → `window.location.href = '/badges/{badge_id}'`.
  - 클러스터 마커 신규: 서버가 준 `{lat,lng,count}`를 숫자 원형 마커로 렌더(개수별 32/38/44px). 클라이언트 병합 로직 없음.
  - `idle` 리스너 + 350ms 디바운스. `isWithin()`으로 **이전 조회 bbox(2% 바깥 마진) 안 + 줌 동일**이면 재조회 스킵. 줌이 바뀌면 항상 재조회(클러스터⇄개별 전환 보장). 언마운트 시 `Event.removeListener`로 해제.
  - 신규 export 타입: `PoiBadgeMarker`, `PoiBadgeClusterMarker`, `MapViewport`. 기존 `PoiMarker` / `onPoiSelect` 시그니처는 무변경.
- `jam-web/src/app/(main)/drops/DropsClient.tsx`
  - `badgeMarkers` / `badgeClusters` state + `handleViewportChange`(→ `/api/poi-badges` 호출) 추가 후 MapView에 전달.
  - 기존 `/api/drops` 로직·바텀시트·픽업 플로우는 **한 줄도 수정하지 않음**. 배지 조회 실패는 조용히 무시해 드랍 플로우에 영향 없음.
- `jam-web/src/types/naver-maps.d.ts` (MapView 전용 최소 타입 선언 — 부득이 확장)
  - `LatLng.lat()/lng()`, `LatLngBounds`(getSW/getNE), `Map.getBounds()/getZoom()`, `Event.removeListener` 추가. 기존 선언 삭제·변경 없음.
- `jam-web/src/app/(main)/badges/[id]/page.tsx`
  - `ShareCardModal` import 및 `{hasEarned && <ShareCardModal .../>}` 블록 제거(타입 구분 없이 전체). `hasEarned` 자체는 다른 곳에서 계속 쓰여 유지.

### 삭제한 파일
- `jam-web/src/app/(main)/badges/[id]/ShareCardModal.tsx`
- `jam-web/src/app/api/share-card/` (하위 `generate/route.tsx` 포함)

### 검증
- `npx tsc --noEmit` — 내 변경 관련 에러 0건 (잔여는 사전 존재하던 `__tests__` jest 타입 미설치뿐. dev-server가 언급한 `.next` 스테일 validator 에러는 `.next/dev/types` 삭제로 해소 확인)
- `npx eslint` — MapView / badges[id]page / naver-maps.d.ts 에러 0건. DropsClient의 `react-hooks/set-state-in-effect` 2건은 `git stash`로 기준선 비교해 **사전 존재**임을 확인(내 변경으로 늘어난 에러 없음).
- `grep -rn "ShareCardModal\|share-card\|shareCard" src` → 0건.

### 결정/주의사항
- `/api/poi-badges` 응답 필드는 dev-server 구현(`mode` / `pois` / `clusters` / `zoom` / `cluster_zoom_threshold`) 기준으로 연동. 클라이언트는 `pois`·`clusters`만 사용하고 `mode` 분기는 두지 않음 — 서버가 반대편 배열을 항상 빈 배열로 내려주므로 그대로 렌더해도 정확하고, 스키마 변화에 더 둔감함.
- 커밋은 하지 않음(팀장 T6 통합 검증 시 일괄 커밋).

## 2026-07-31 — tester: T2 중단 (테스트 러너 미설치 발견)
- 프로젝트에 jest/vitest 등 어떤 테스트 러너도 설치돼 있지 않고, 기존 `__tests__` 파일들도 실행된 적 없는 상태를 확인(DEAD_ENDS 참고).
- 유저 확인 결과 "테스트 생략하고 바로 통합"으로 결정 → 태스크 삭제, 통합 검증(T6)으로 진행.

## 2026-07-31 — 메인세션(팀장): T6 통합 검증 완료
- `npx tsc --noEmit`: Phase17 관련 파일(poi-badges, badge-clustering, MapView, DropsClient, badges/[id]/page, naver-maps.d.ts) 에러 0건 확인(grep으로 전체 293줄 에러 중 무관함 재확인). 잔여 에러는 전부 기존 `__tests__` jest 타입 미설치 문제.
- `npx eslint` (Phase17 변경 파일 대상): DropsClient.tsx의 `react-hooks/set-state-in-effect` 2건은 `git show HEAD:...`로 원본 대조해 **변경 전부터 존재**함을 재확인(회귀 아님).
- 코드 리뷰: `poi-badges/route.ts`, `badge-clustering.ts`, `MapView.tsx`, `DropsClient.tsx` diff 직접 읽고 PRD 요구사항 대조 완료 — 요구사항과 일치.
- `git status`로 변경 파일 전체 확인, 계획에 없던 추가 변경 없음.
- `Service Plan/Specs/SERVICE_OPERATIONS_20260731_1200.md` 신규 생성(프로젝트 문서화 규칙).
- 커밋 + push 진행.
