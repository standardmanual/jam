# 발견 사항 & 공유 자료 (development-phase17)

## 2026-07-31 — 메인세션(팀장): 기존 코드 조사 요약

- 드랍 지도: `jam-web/src/app/(main)/drops/DropsClient.tsx` + `jam-web/src/components/map/MapView.tsx`. 현재 `/api/drops?lat=&lng=`로 사용자 위치 반경(500m) 기반 조회, 뷰포트 기반 아님.
- 드랍/픽업 마커: `MapView.tsx`의 `markerIconHtml()` — 현재 색상 원(초록/회색/진회색), 20px 리디자인 필요.
- POI 배지: `badges.type='poi'`, `poi.linked_badge_id`(POI→배지 FK, `poi_tier`, `radius_meters` 등 컬럼 이미 존재), 획득 이력은 `user_poi_badge_earns` 테이블(user_id, badge_id, poi_id, earned_at).
- 배지 상세화면: `jam-web/src/app/(main)/badges/[id]/page.tsx` — activity/item/poi 3타입 이미 한 화면 공유. `ShareCardModal`은 574번째 줄 부근 `hasEarned && <ShareCardModal .../>` 로 노출 중. `ShareCardModal.tsx`, `/api/share-card`는 이 화면에서만 쓰여 제거해도 다른 화면 영향 없음(코드 조사로 확인 완료).
- 네이버 지도 SDK: `window.naver.maps`, `naver.maps.Map`, `naver.maps.Marker`, `naver.maps.Event.addListener(marker, 'click', ...)` 패턴 사용 중. 뷰포트 변경 감지는 `naver.maps.Event.addListener(map, 'idle', ...)`로 추가하면 됨(네이버 지도 API 표준 이벤트).
- PRD 원문: `Service Plan/History/Phase17_01_PRD.md` (섹션 3-1~3-7이 기능요구사항, 섹션 6이 완료기준 체크리스트).

---

## 2026-07-31 — dev-server: `/api/poi-badges` 최종 API 응답 스키마 (dev-client 연동용)

### 요청

```
GET /api/poi-badges?swLat={number}&swLng={number}&neLat={number}&neLng={number}&zoom={number}
```

- 5개 파라미터 모두 필수. 하나라도 숫자가 아니면 `400 { error }`.
- 미인증 시 `401 { error: '인증 필요' }` (세션 쿠키 기반, 클라이언트에서 `fetch`만 하면 됨).
- 남서/북동 위도가 뒤집혀 들어와도 자동 정규화. 날짜변경선 wrap(swLng > neLng)도 처리.

### 응답 (200) — 개별 모드 / 클러스터 모드 공통 봉투

```ts
{
  mode: 'individual' | 'cluster',   // zoom > 13 → 'individual', zoom <= 13 → 'cluster'
  zoom: number,                     // 서버가 파싱한 줌 (에코백)
  cluster_zoom_threshold: 13,       // 클러스터 전환 기준 (하드코딩 대신 이 값 사용 권장)
  pois: PoiBadgeItem[],             // cluster 모드에서는 항상 []
  clusters: PoiBadgeCluster[],      // individual 모드에서는 항상 []
}
```

**두 배열은 항상 존재한다** (없을 때 `[]`). `undefined` 방어 코드 불필요.

```ts
interface PoiBadgeItem {
  poi_id: string
  badge_id: string      // 탭 시 이동 경로: /badges/{badge_id}
  name: string
  latitude: number
  longitude: number
  image_url: string | null   // badges.image_url (null 가능 → 플레이스홀더 필요)
  earned: boolean            // true=원본 컬러+탭 가능, false=그레이+탭 비활성
}

interface PoiBadgeCluster {
  lat: number    // 셀 내 POI 좌표 평균(무게중심), 소수 6자리
  lng: number
  count: number  // 마커에 표시할 숫자
}
```

### 동작 규칙 (dev-client가 알아야 할 것)

- **대상 POI**: `poi.linked_badge_id`가 있고 연결 배지가 `type='poi'` + `deleted_at IS NULL` 인 것만. 드랍/픽업용 카페 POI(`/api/drops`)와 완전히 별개 집합이므로 마커를 겹쳐 그려도 중복 없음.
- **거리 제한 없음** — 뷰포트 안이면 무조건 반환(PRD 확정사항).
- **`earned` 판정**: 로그인 유저의 `user_poi_badge_earns`에 해당 `badge_id` 행이 1건이라도 있으면 true (POI 단위 아님, **배지 단위**). 같은 배지가 여러 POI에 연결돼 있으면 전부 획득 상태로 보인다.
- **클러스터 모드에서는 개별 좌표·배지 id가 일절 내려가지 않는다.** 클러스터 마커는 탭 동작 없음(또는 줌인 정도)으로 구현할 것.
- 뷰포트당 최대 2000건(`MAX_POIS`)까지만 조회 — 그 이상은 잘린다.

### 순수 함수 (tester 참고)

`jam-web/src/lib/poi/badge-clustering.ts`:

- `clusterPoiBadges(pois: {latitude:number; longitude:number}[], zoom: number): {lat:number;lng:number;count:number}[]`
- `gridCellSizeForZoom(zoom: number): number` — `360 / 2^zoom` 을 `[0.01, 45]`로 클램프. zoom 13 → 0.0439°(≈4.9km), 10 → 0.3516°, 6 → 5.625°. 줌이 작을수록 셀이 커짐(단조 증가) 보장.
- `shouldCluster(zoom): boolean` — `zoom <= 13`
- `CLUSTER_ZOOM_THRESHOLD = 13`
- 특성: 좌표가 NaN/Infinity면 무시, 빈 배열이면 `[]`, 정렬은 count 내림차순 → lat 내림차순 → lng 오름차순으로 결정적(deterministic). DB/네트워크 의존 전혀 없음.

---

# DEAD_ENDS (시도했으나 실패한 접근)

## 2026-07-31 — tester: 클러스터링 단위테스트 실행 불가
- 시도: `badge-clustering.ts` 단위테스트를 이 프로젝트의 기존 테스트 러너로 실행하려 함
- 결과: `package.json`에 jest/vitest 등 어떤 테스트 러너도 devDependencies에 없고, `node_modules/.bin`에도 없음. 기존 `src/lib/**/__tests__/*.test.ts` 파일들(badge-engine, drop-engine, missions, points 등)도 `describe/it/expect` 문법으로 작성돼 있지만 실행할 방법이 없는 상태 — Phase 17과 무관한 기존 프로젝트 상태.
- 근거: `jam-web/package.json` scripts에 `test` 없음, `npx --no-install jest/vitest --version` 실패.
- 처리: 유저 확인 후 이번 Phase 17에서는 단위테스트를 생략하고 통합 검증으로 진행하기로 결정. 테스트 러너 도입은 별도 사안.
