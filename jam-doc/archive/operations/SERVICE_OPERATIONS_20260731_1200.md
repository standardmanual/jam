# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 12:00)

> **이 버전의 변경 내용:** Phase 17 — 드랍 메뉴를 "JAM"으로 개편, 지도 위에 산/지하철 POI 방문 배지 노출(뷰포트 기반 조회 + 서버 그리드 클러스터링), 드랍/픽업 마커 리디자인, 배지 상세화면 공유카드 기능 전체 제거.
> 이전 버전: SERVICE_OPERATIONS_20260731_1130.md

---

## [신규 기능] JAM 지도 — POI 방문 배지 노출

**배경**: `badges.type='poi'`(산/지하철 등 방문 배지, Phase 16에서 도입)가 지금까지 `/badges` 목록에서만 확인 가능했고, 드랍 지도에는 전혀 노출되지 않았음. `Service Plan/History/Phase17_01_PRD.md` 요구사항에 따라 지도에서 직접 탐색·확인 가능하도록 개편.

**변경 내용**:
1. 하단 탭/화면 라벨 "드랍" → **"JAM"**으로 변경(`src/lib/i18n/ko.ts`의 `nav.drops`). 라우트 `/drops`, 파일/컴포넌트명은 무변경.
2. 신규 API **`GET /api/poi-badges?swLat=&swLng=&neLat=&neLng=&zoom=`**(`src/app/api/poi-badges/route.ts`) — 지도 뷰포트(bounding box) 안의 POI 방문 배지만 반환. 기존 `/api/drops`(사용자 위치 반경 500m 기반, 드랍/픽업 카페 등 POI 대상)와 완전히 별개 파이프라인이며 로직을 공유하지 않음.
   - 대상: `poi.linked_badge_id`가 있고 연결 배지가 `type='poi'` + `deleted_at IS NULL`인 POI. 거리 제한 없이 뷰포트 안이면 무조건 반환.
   - 줌 13 초과: 개별 목록 반환(`{poi_id, badge_id, name, latitude, longitude, image_url, earned}`). `earned`은 로그인 유저의 `user_poi_badge_earns`에 해당 `badge_id` 이력이 1건 이상이면 true — **배지 단위 판정**(같은 배지가 여러 POI에 연결돼 있으면 전부 획득 상태로 표시됨, PRD 확정사항).
   - 줌 13 이하: 개별 좌표를 노출하지 않고, 그리드 셀 단위로 집계한 `{lat, lng, count}`만 반환(API payload 절감 목적). 그리드 집계는 순수 함수 `clusterPoiBadges`(`src/lib/poi/badge-clustering.ts`)로 분리 — 셀 크기는 `360 / 2^zoom`을 `[0.01°, 45°]`로 클램프해 줌이 작을수록 커짐.
   - 뷰포트당 최대 2,000건(`MAX_POIS`) 제한.
3. 지도 마커(`src/components/map/MapView.tsx`):
   - **드랍/픽업 마커 리디자인**: 20px 서클(선택 시 26px). 픽업 가능=메인 포인트 컬러, 불가=그레이, 범위 밖=진회색+반투명(기존 표현 유지). 내부에 드랍/픽업을 상징하는 하강 화살표 아이콘을 네거티브 컬러로 표시.
   - **POI 배지 마커(신규)**: 30px 원형 배지 이미지. 미획득은 그레이스케일 필터 + **클릭 리스너 자체를 등록하지 않아 탭해도 무반응**(비활성). 획득 시에만 원본 컬러로 표시되고 탭하면 `/badges/{badge_id}`로 이동.
   - **클러스터 마커(신규)**: 서버가 내려준 `{lat, lng, count}`를 숫자 원형 마커로 그대로 렌더링(클라이언트 측 병합 로직 없음).
   - 지도 `idle` 이벤트(이동/줌 완료) + 350ms 디바운스로 뷰포트 변경을 감지하고, 이전 조회 범위(2% 마진) 밖으로 나갔거나 줌이 바뀌었을 때만 `/api/poi-badges`를 재호출(범위 내 이동은 재호출 안 함 — API 호출량 최적화).
   - `DropsClient.tsx`에서 `badgeMarkers`/`badgeClusters` state로 연동. 기존 `/api/drops` 기반 드랍/픽업 로직·바텀시트·픽업 플로우는 변경 없음(배지 조회 실패도 드랍 플로우에 영향 없이 조용히 무시됨).

**관련 파일**: `src/app/api/poi-badges/route.ts`(신규), `src/lib/poi/badge-clustering.ts`(신규), `src/components/map/MapView.tsx`, `src/app/(main)/drops/DropsClient.tsx`, `src/lib/i18n/ko.ts`, `src/types/naver-maps.d.ts`(bounds/zoom 조회용 타입 확장).

---

## [기능 제거] 배지 상세화면 공유카드 기능 전체 삭제

**배경**: PRD 원 요청은 POI 타입 배지의 공유카드만 제외하는 것이었으나, 인터뷰 확인 결과 **활동/아이템/POI 전 타입에서 공유카드 기능을 완전히 제거**하는 것으로 범위가 확정됨.

**변경 내용**: `src/app/(main)/badges/[id]/page.tsx`에서 `ShareCardModal` import 및 렌더 블록 삭제. `ShareCardModal.tsx` 파일과 `/api/share-card/generate` 라우트 삭제, 미사용이 된 i18n `badges.shareCard*` 문구 6개 정리. 다른 화면에서 참조가 없음을 `grep` 전수 확인.

**관련 파일**: `src/app/(main)/badges/[id]/page.tsx`, `src/app/(main)/badges/[id]/ShareCardModal.tsx`(삭제), `src/app/api/share-card/`(삭제), `src/lib/i18n/ko.ts`.

---

## [메모] 프로젝트에 테스트 러너 미설치 상태 확인(기존 이슈, 이번 변경 아님)

Phase 17 작업 중 확인된 사실: `jam-web/package.json`에 jest/vitest 등 테스트 러너가 devDependencies로 설치돼 있지 않고, `src/lib/**/__tests__/*.test.ts`(badge-engine, drop-engine, missions, points 등)에 `describe/it/expect` 문법의 테스트 파일이 존재함에도 실행할 방법이 없는 상태. `npx tsc --noEmit`에서도 해당 파일들에 대해 지속적으로 타입 에러가 발생 중(사전부터 존재, 이번 커밋으로 늘어나지 않음). 테스트 러너 도입 여부는 별도 결정 필요 사안으로 이번 Phase 범위에서는 보류.
