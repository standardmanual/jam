# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 22:05)

> **이 버전의 변경 내용:** 네이버 지역검색 결과 0건 버그(1412/1417에서 수정)가 배포된 뒤에도 `poi_search_cache`의 7일 TTL 때문에 이미 "0건"으로 캐시된 지역은 계속 재검색이 안 되던 문제 수정 — 결과 0건 캐시는 1시간짜리 짧은 TTL로 분리.
> 이전 버전: SERVICE_OPERATIONS_20260723_1435.md

---

## [수정] 검색 결과 0건 캐시가 7일간 재시도를 막던 문제

**증상**: 네이버 지역검색 버그(좌표 미반영) 수정을 배포한 뒤에도 같은 위치에서 여전히 POI가 안 보임.

**원인**: `poi_search_cache`(`supabase/migrations/040_poi_search_cache.sql`)는 "이 위치·카테고리를 언제 검색했는지"만 기록하고, 결과가 0건이었어도 7일 TTL로 동일하게 캐시함(`SEARCH_CACHE_TTL_SECONDS`). 버그가 살아있던 동안 이미 "검색함(0건)"으로 캐시된 위치는, 코드를 고쳐도 캐시가 만료되는 최대 7일 뒤에나 재검색됨.

**수정**:
- 마이그레이션 045: `poi_search_cache.had_results BOOLEAN` 추가. 기존 행은 전부 `false`로 백필(이번 버그로 오염됐을 가능성 배제 못하므로 안전하게 짧은 TTL 쪽으로).
- `src/lib/poi/categories.ts`: `EMPTY_RESULT_CACHE_TTL_SECONDS = 1시간` 추가(기존 `SEARCH_CACHE_TTL_SECONDS`=7일은 결과가 있었던 경우에만 적용).
- `src/lib/poi/search-cache.ts`: `shouldSearch`가 `had_results`에 따라 TTL을 분기, `markSearched`가 이번 검색에 결과가 있었는지(`hadResults`)를 받아 저장.
- `src/app/api/drops/route.ts`: `fetchNearbyNaverPoisForCategories` 응답을 카테고리별로 집계해 카테고리마다 실제로 결과가 있었는지 판별 후 `markSearched`에 전달. 네이버 API 호출 자체가 실패한 경우(`fetchFailed`)도 결과 없음으로 취급해 짧은 TTL로 재시도.

### ⚠️ 즉시 조치 필요 — 수동 DB 작업

이번 세션 환경에는 Supabase 서비스 키가 없어 마이그레이션 적용과 캐시 정리를 직접 실행할 수 없음. 다음 두 가지는 계정 소유자가 Supabase 대시보드 SQL 에디터에서 직접 실행해야 함:

1. **마이그레이션 045 적용** (`supabase/migrations/045_poi_search_cache_empty_ttl.sql` 내용 그대로 실행)
2. **기존 오염된 캐시 즉시 정리** (당장 재검색되게 하려면 마이그레이션 전후 상관없이 안전하게 실행 가능):
   ```sql
   DELETE FROM poi_search_cache;
   ```
   실제 POI 데이터(`poi` 테이블)는 건드리지 않음 — 순수 "검색했었는지" 메타데이터만 지우는 것이라 다음 요청 시 전부 재검색될 뿐 데이터 손실 없음.

---

기타 섹션은 이전 버전과 동일.
