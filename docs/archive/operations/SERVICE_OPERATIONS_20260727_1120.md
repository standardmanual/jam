# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 11:20)

> **이 버전의 변경 내용:** ① 전국 지하철/기차역 POI 929개 일괄 등록 ② 어드민 POI 관리 개선(카테고리 필터/정렬/페이지네이션 + `poi_category` ENUM → `poi_categories` 테이블 전환으로 카테고리 CRUD 지원)
> 이전 버전: SERVICE_OPERATIONS_20260726_1912.md

---

## 전국 지하철/기차역 POI 일괄 등록

**관련 파일:** `scripts/match-stations-poi.js`, `scripts/insert-stations-poi.js`, `scripts/rename-manual-override-stations.js` (전부 신규, 기록/재실행용)

- **데이터 소스**: 유저가 제공한 엑셀(전국 지하철/기차역 963행, `노선`+`역이름` 컬럼)
- **좌표 매칭**: 네이버 지역검색으로 `역이름`(또는 동명역 충돌 시 `노선 역이름`)을 검색. 카테고리가 `교통,운수>지하철|기차역|버스터미널` 또는 `기차,철도>*`이고 제목이 역이름으로 시작(구분자 `·`/`.`, 괄호 부기 표기 차이는 정규화해서 흡수)하는 결과만 채택.
- **환승역 병합**: 같은 역이름이 노선별로 검색됐을 때 좌표가 1km 이내면 물리적으로 동일한 역으로 판단해 1개 POI로 병합(14그룹, 예: 강남역 2호선/신분당선). 사용자 확인 후 진행.
- **자동매칭 실패 처리**: 44건 → 카테고리 정규식 보정(`기차역` 누락 등)과 `display=10` 확대, 괄호/구분자 정규화로 18건까지 축소. 나머지는 개별 수동 확인:
  - 15건은 개명/오타/영문표기 등으로 실제 역을 찾아 좌표를 매핑하고, **이름도 실제 매칭명으로 정정**(예: 당고개역→불암산역, 성당못역→서부정류장역, 신남역→청라언덕역, 쾌법르네시떼역→괘법르네시떼역(원본 오타))
  - 뚝섬유원지역은 자양역과 물리적으로 같은 지점이라 별도 등록 생략(자양역 POI가 이미 존재)
  - 창릉역(GTX-A)·학익역(수인분당선)은 미개통이라 제외
- **결과**: 기존 44개(자동검색 파이프라인 tier-2) + 신규 929개 = **transit 카테고리 973개**
- **DB 반영**: DDL 없이 순수 INSERT/UPDATE(DML)라 서비스 롤 키로 직접 실행 완료

---

## 어드민 POI 관리 개선

**관련 파일:**
- `supabase/migrations/050_poi_categories_table.sql` (신규 — **DDL, 유저가 Supabase SQL Editor에서 직접 실행**)
- `src/app/api/admin/poi-categories/route.ts`, `src/app/api/admin/poi-categories/[slug]/route.ts` (신규)
- `src/app/admin/poi/page.tsx`, `PoiFilters.tsx`(신규), `Pagination.tsx`(신규), `CategoryManager.tsx`(신규), `categories/page.tsx`(신규), `PoiForm.tsx`, `new/page.tsx`, `[id]/page.tsx`
- `src/types/database.ts` — `PoiCategory`를 고정 유니언 타입에서 `string`으로 변경, `PoiCategoryRow` 타입 추가

- **스키마 변경**: `poi.category`가 Postgres ENUM(`poi_category`, 값 추가만 가능하고 삭제/수정 불가)이라 어드민이 카테고리를 자유롭게 관리할 수 없었음. `poi_categories` 테이블(`slug` PK, `label`)을 만들고 `poi.category`를 이 테이블을 참조하는 TEXT 컬럼(FK, `ON UPDATE CASCADE ON DELETE RESTRICT`)으로 전환. 기존 13개 카테고리(mountain~nature)는 그대로 시드.
- **드랍/픽업 파이프라인과의 관계**: `src/lib/poi/categories.ts`의 `POI_CATEGORIES`(자동검색 키워드 매핑, 8개 카테고리)는 코드에 하드코딩돼 있어 DB 카테고리 삭제와 무관하게 계속 동작함. 다만 어드민에서 이 8개 카테고리를 삭제/이름변경하면 표시상 혼동이 생길 수 있어, 카테고리 관리 화면에서 이 8개에 "파이프라인 연동" 배지를 표시(삭제 자체는 차단하지 않음 — 요청에 따른 설계).
- **POI 목록 화면**: 카테고리 필터, 이름 오름차순/내림차순 정렬(기본은 최근 등록순 유지), 30개 단위 페이지네이션(숫자 네비게이션 + 이전/다음) 추가. 전부 URL 쿼리 파라미터(`category`, `sort`, `page`) 기반 서버 컴포넌트 렌더링.
- **카테고리 CRUD**: `/admin/poi/categories`에서 생성(`slug`는 영문 소문자/숫자/밑줄, `label`은 자유), 라벨 수정, 삭제 지원. 삭제 시 해당 카테고리를 쓰는 POI 개수를 먼저 조회해 있으면 API 레벨에서 차단(친절한 에러 메시지) + DB FK(`ON DELETE RESTRICT`)가 이중 안전장치로 동작.
- **DB 반영**: **DDL 포함이라 서비스 롤 키로 직접 실행 불가** (`exec_sql` 같은 RPC 없음 확인) — 유저가 Supabase SQL Editor에서 `050_poi_categories_table.sql` 직접 실행함. 실행 후 데이터 무결성(1993개 poi 행 유지, `poi_categories` 13행 시드) 확인 완료.
- **검증 한계**: 어드민 화면은 Google OAuth 로그인 + `ADMIN_EMAILS` 환경변수가 필요해 로컬 브라우저 자동화로 UI 클릭 검증은 하지 못함. 대신 API가 사용하는 것과 동일한 쿼리(필터+정렬+페이지네이션, 카테고리 생성/수정/삭제, FK 삭제 차단)를 서비스 롤 키로 직접 실행해 데이터 레이어 정상 동작을 확인했고, `tsc --noEmit` + `eslint` 통과 확인.
