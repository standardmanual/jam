# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 15:43)

> **이 버전의 변경 내용:** 드랍/픽업 POI(T2) 소스를 브랜드명 키워드 검색에서 카테고리 기반 검색으로 전면 개편 — 관공서/교통/병원/약국/관광명소/자연/편의점·마트/카페·음식점을 전부 네이버 지역검색으로 자동 수집. 레벨 기반 조회 우선순위 + 그리드 캐싱으로 API 호출량 절감.  
> 이전 버전: SERVICE_OPERATIONS_20260722_1442.md

---

## [변경] POI 카테고리 체계 전면 개편 — 브랜드 검색 → 카테고리 레벨 검색

**관련 파일:** `src/lib/poi/categories.ts`(신규), `src/lib/poi/naver.ts`, `src/lib/poi/search-cache.ts`(신규), `src/app/api/drops/route.ts`, `src/app/api/drops/debug/route.ts`

이전 버전(1442)에서는 "CU", "스타벅스" 등 브랜드명을 하나하나 검색하는 방식이었음(작업 편의를 위한 임시 예시였음이 이후 확인됨). 이번 버전에서 실제 요구사항에 맞게 **어드민 수동 등록 없이, 카테고리 단위로 네이버 지역검색을 자동 수행**하도록 전면 개편했다.

### 카테고리 구성 (`src/lib/poi/categories.ts`)

| 카테고리 | 검색 키워드 | 레벨 |
|---|---|---|
| government (관공서) | 주민센터, 구청, 시청 | 1 |
| transit (교통) | 지하철역, 버스정류장 | 1 |
| hospital (병원) | 병원 | 1 |
| pharmacy (약국) | 약국 | 1 |
| tourist_attraction (관광명소) | 관광명소 | 1 |
| nature (자연) | 국립공원, 계곡, 해수욕장, 폭포 | 1 |
| convenience (편의점/마트) | 편의점, 마트 | 2 |
| food (카페/음식점) | 카페, 음식점 | 2 |

- **레벨 1은 항상 검색.** 레벨 2(편의점/카페 계열)는 레벨 1 결과가 지역 내 3개 미만(`LEVEL_2_FALLBACK_THRESHOLD`)일 때만 보조로 검색 — 화면에 보이는 POI 자체는 두 레벨 다 동일하게 드랍/픽업 가능한 지점이며, 레벨은 오직 네이버 API 호출 우선순위(하루 25,000회 한도 절약용)만 조절한다.
- 자연물(산/바다/강/계곡)은 애초 계획했던 "어드민 수동 등록" 방식을 취소하고, 다른 카테고리와 동일하게 네이버 지역검색 키워드로 통일 — 어드민 개입 없이 전부 자동 수집.
- `poi_category` enum에 `government/transit/hospital/pharmacy/tourist_attraction/convenience/food/nature` 8개 값 추가 (마이그레이션 039). 기존 tier-1 전용 값(`mountain/bike_route/trail/park`)은 그대로 유지.

### 그리드 기반 검색 캐싱 (`src/lib/poi/search-cache.ts`, `poi_search_cache` 테이블 — 마이그레이션 040)

- 위경도를 약 100m 격자로 반올림한 `grid_key` + `category` 조합으로 "마지막으로 언제 검색했는지"를 기록.
- TTL(1시간, `SEARCH_CACHE_TTL_SECONDS`) 이내에 같은 격자·카테고리를 다시 조회하면 네이버 API를 호출하지 않고 스킵 — 실제 POI 데이터 자체는 `poi` 테이블에 영구 저장되어 캐시 만료 여부와 무관하게 항상 서빙됨. 이 테이블은 순수하게 "재호출 여부 판단용" 메타데이터.

### `src/lib/poi/naver.ts` 변경

- `fetchNearbyNaverPois`(브랜드 하드코딩) → `fetchNearbyNaverPoisForCategories(lat, lng, radiusM, categories: PoiCategoryConfig[])`로 일반화. 카테고리별 키워드를 모두 검색해 반경 필터링 후 반환.
- `NaverPlace.category` 타입을 `'convenience'|'cafe'` 고정 유니온에서 `PoiCategory`(DB enum과 동일) 전체로 확장.

### `src/app/api/drops/route.ts` T2 로직 재작성

- `searchAndPersistCategories()` 헬퍼: 카테고리 목록을 받아 캐시 확인 → 만료분만 네이버 검색 → DB 신규 삽입 → 캐시 갱신을 한 번에 처리.
- GET 핸들러: 레벨 1 카테고리로 먼저 호출 → DB의 레벨 1 카테고리 POI가 반경 내 3개 미만이면 레벨 2까지 추가 호출 → 최종 결과 병합.
- 신규 POI는 실제 카테고리(`p.category`)로 저장 (이전엔 전부 `'other'` 고정이었음).

### 실 API 검증 완료

발급받은 네이버 지역검색 Client ID/Secret으로 서울시청 좌표 기준 실제 호출 확인 — 레벨 1(관공서 7건, 교통 5건, 병원 5건, 약국 5건, 관광명소 5건), 레벨 2(편의점/마트 10건, 카페/음식점 7건) 정상 반환. `nature`(국립공원/계곡/해수욕장/폭포)는 서울 도심 특성상 이 좌표 기준으로는 0건 — 검색 자체는 정상 동작하며 결과 없음은 위치 특성.

### 알려진 한계

- 개별 키워드 호출이 일시적으로 실패(네트워크 순단 등)해도 `searchAndPersistCategories`는 해당 카테고리를 "검색 완료"로 캐시에 기록한다 — 드물게 TTL(1시간) 동안 해당 카테고리가 비어 보일 수 있음. 재시도 로직은 아직 없음.
- 네이버 지역검색은 좌표 기반 반경 검색이 아닌 키워드 검색이라, 키워드에 없는 상호/시설은 여전히 노출되지 않음.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_1442.md)과 동일. §16 DB 테이블 목록에 `poi_search_cache` 신규, `poi.category` 허용값 확장 반영 필요.
