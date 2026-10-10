# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 14:42)

> **이 버전의 변경 내용:** 드랍/픽업 지도(Google Maps → 네이버 지도 NCP Maps.js)와 POI 데이터 소스(T2: OSM Overpass → 네이버 지역검색 오픈API) 전환. `poi.naver_id` 컬럼 추가(마이그레이션 038), 어드민 POI 등록 화면에 네이버 장소 검색 기능 추가.  
> 이전 버전: SERVICE_OPERATIONS_20260722_1120.md

---

## [변경] 드랍/픽업 지도 렌더링: Google Maps → 네이버 지도

**관련 파일:** `src/components/map/MapView.tsx`, `src/app/(main)/badges/[id]/PoiMapButton.tsx`, `src/types/naver-maps.d.ts`(신규)

- `google.maps.Map/Marker/Circle` → `naver.maps.Map/Marker/Circle`로 교체. 스크립트 로더가 `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`를 로드.
- 마커 아이콘은 원형 HTML `content`로 직접 그려 기존 색상 로직(드랍 가능=초록, 반경 내=회색, 반경 밖=진회색, 선택 시 확대)을 그대로 재현.
- 다크 테마는 `NEXT_PUBLIC_NAVER_MAP_STYLE_ID`(NCP Style Map Studio에서 제작한 커스텀 스타일 ID)가 설정된 경우에만 적용, 없으면 기본 지도로 폴백.
- 배지 상세의 "지도에서 보기" 버튼(`PoiMapButton`)은 `https://map.naver.com/p/search/{POI 이름}` 딥링크로 교체.
- `@googlemaps/js-api-loader`, `@types/google.maps` 패키지 제거. 대신 실제 사용하는 API 표면만 커버하는 최소 타입 선언(`src/types/naver-maps.d.ts`) 신규 작성.
- **환경변수:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 삭제 → `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`(필수, ncpKeyId), `NEXT_PUBLIC_NAVER_MAP_STYLE_ID`(선택) 추가. 두 값 모두 아직 미발급 상태이므로 발급 후 Vercel/`.env.local`에 설정 필요.

## [변경] POI 데이터 소스(T2): OSM Overpass → 네이버 지역검색

**관련 파일:** `src/lib/poi/naver.ts`(신규, `src/lib/poi/overpass.ts` 대체), `src/app/api/drops/route.ts`, `src/app/api/drops/debug/route.ts`

기존에 `poi` 테이블은 두 계층으로 운영되고 있었다:
- **tier 1**: 어드민이 수동 등록한 고정 지점(산/트레일/자전거길/공원). `linked_badge_id`로 특정 배지와 연결되어 Strava GPS 경로 매칭(`matchPoisForActivity`)에도 쓰임 — **이 배지 발급 로직은 이번 변경과 무관하게 그대로 유지**.
- **tier 2**: 외부 API로 편의점/카페를 실시간 수집해 `poi`에 자동 삽입하는, 드랍/픽업 화면의 "지도에서 지점 선택" 기능의 실제 데이터 소스. 지금까지는 OpenStreetMap Overpass API를 사용했음.

이번 변경으로 tier 2의 소스를 **네이버 지역검색(Local Search) 오픈API**로 교체했다:

- `src/lib/poi/naver.ts`: `fetchNearbyNaverPois(lat, lng, radiusM)` — 편의점/카페 브랜드 키워드 목록으로 네이버 지역검색을 호출한 뒤 결과를 반경으로 필터링해 리턴. 네이버 지역검색은 Overpass와 달리 **반경 검색이 아닌 키워드 검색 API**라서, 브랜드별 키워드 루프 + haversine 거리 필터 방식으로 동일한 사용자 경험을 재현함(브랜드 목록에 없는 상호는 여전히 못 찾음 — 알려진 한계).
  - 네이버 지역검색 응답은 안정적인 place ID를 보장하지 않음 — `link` 필드에서 `place/(숫자)` 패턴을 추출해 `naver_id`로 쓰고, 추출 실패 시 이름+좌표 기반 dedup 키로 폴백.
  - 인증: `NAVER_LOCAL_SEARCH_CLIENT_ID`/`NAVER_LOCAL_SEARCH_CLIENT_SECRET`(서버 전용 시크릿, `NEXT_PUBLIC_` 아님) 헤더 사용.
- `src/app/api/drops/route.ts`: `fetchNearbyOsmPois` 호출을 `fetchNearbyNaverPois`로 교체. 신규 POI 삽입 시 `osm_id` 대신 `naver_id` 컬럼에 저장(로직 구조는 동일).
- `src/lib/poi/overpass.ts` 삭제(더 이상 호출하는 곳 없음).
- 기존에 OSM으로 이미 수집돼 있던 tier-2 POI 행과 `osm_id` 컬럼은 그대로 보존(삭제/백필 없음).

### DB 마이그레이션 038

```sql
ALTER TABLE public.poi ADD COLUMN IF NOT EXISTS naver_id TEXT;
ALTER TABLE public.poi ADD CONSTRAINT poi_naver_id_unique UNIQUE (naver_id);
```

## [변경] 어드민 POI 등록 화면에 네이버 장소 검색 추가

**관련 파일:** `src/app/admin/poi/PoiForm.tsx`, `src/app/api/admin/poi/naver-search/route.ts`(신규)

- 신규 등록 모드에서만 "네이버 장소 검색으로 채우기" 검색창 노출. `GET /api/admin/poi/naver-search?query=`(admin 인증 필요)로 검색 → 결과 클릭 시 이름/위도/경도 자동 채움.
- `radius_meters`/`category`/`linked_badge_id`는 네이버 데이터에 없는 JAM 고유 개념이라 계속 어드민이 직접 입력. 좌표 수동 입력 필드도 유지(네이버 검색 결과에 없는 위치도 등록 가능).

---

기타 섹션(뱃지 발급 엔진의 GPS-POI 매칭, 어뷰징 방어, DB 테이블 목록 등)은 이전 버전(SERVICE_OPERATIONS_20260722_1120.md)과 동일. 단, §15 API 라우트 목록에 `GET /api/admin/poi/naver-search` 추가, §16 DB 테이블 목록의 `poi` 설명에 `naver_id` 컬럼 추가로 갱신 필요.
