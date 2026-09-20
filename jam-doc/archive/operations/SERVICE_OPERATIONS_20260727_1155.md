# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 11:55)

> **이 버전의 변경 내용:** POI 카테고리의 드랍/픽업 파이프라인 연동(키워드·티어)을 코드 하드코딩에서 어드민 관리로 전환
> 이전 버전: SERVICE_OPERATIONS_20260727_1120.md

---

## POI 카테고리 파이프라인 연동 어드민화

**관련 파일:**
- `supabase/migrations/051_poi_categories_pipeline_fields.sql` (신규 — **DDL, 유저가 Supabase SQL Editor에서 직접 실행**)
- `src/lib/poi/categories.ts` — 하드코딩 배열 제거, DB 조회 함수로 전환
- `src/app/api/drops/route.ts`, `src/app/api/drops/debug/route.ts`
- `src/app/api/admin/poi-categories/route.ts`, `[slug]/route.ts`
- `src/app/admin/poi/CategoryManager.tsx`, `categories/page.tsx`

- **이전 구조**: 드랍/픽업 자동검색이 쓰는 8개 카테고리(government/transit/hospital/pharmacy/tourist_attraction/nature/convenience/food)의 키워드와 티어(1=항상 검색, 2=티어1 부족 시 보조 검색)가 `src/lib/poi/categories.ts`에 하드코딩돼 있어, 바꾸려면 코드 배포가 필요했음.
- **변경 후**: `poi_categories` 테이블에 `pipeline_linked BOOLEAN`, `tier SMALLINT(1|2, nullable)`, `keywords TEXT[]` 컬럼 추가. `src/lib/poi/categories.ts`의 `loadPipelineCategories(service)`가 매 `/api/drops` 요청마다 `pipeline_linked=true`이고 키워드가 1개 이상인 카테고리만 조회해 레벨1/레벨2로 분류 — **어드민에서 키워드나 티어를 바꾸면 배포 없이 즉시 드랍/픽업 검색 동작이 바뀐다.**
- **마이그레이션 시 기존 값 이관**: government/transit/hospital/pharmacy/tourist_attraction/nature → tier 1, convenience/food → tier 2, 키워드는 기존 코드 값 그대로. 그 외 카테고리(mountain/bike_route/trail/park/other 등 기존 tier-1 수동등록 전용)는 `pipeline_linked=false`가 기본값 — **이번 개편 이전에 파이프라인 연동이 없던 카테고리는 계속 미연동 상태로 시작**한다는 요구사항 반영.
- **어드민 UI**(`/admin/poi/categories`): 카테고리 생성/수정 시 "파이프라인 연동" 체크박스 → 켜면 티어(1/2) select + 키워드(콤마 구분) 입력 노출. 목록 테이블에 연동 상태(연동중/미연동 배지), 티어, 키워드 칩을 표시.
- **서버 검증**: `pipeline_linked=true`인데 티어 미지정이거나 키워드가 0개면 API에서 400으로 막음(자동검색이 조용히 아무 결과도 없는 카테고리가 되는 것 방지).
- **DB 반영**: DDL 포함이라 서비스 롤 키로 직접 실행 불가 — 유저가 Supabase SQL Editor에서 `051_poi_categories_pipeline_fields.sql` 직접 실행함. 실행 후 8개 카테고리 값이 기존 코드와 정확히 일치하는지, CRUD(생성/수정/삭제)가 정상 동작하는지 서비스 롤 키로 직접 조회해 확인 완료.
