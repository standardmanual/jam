# 지점 (POI) 컨텐츠 관리

> 용어: 드랍·픽업·체크인이 일어나는 **지점** 정보를 다룬다. 지점에 체크인해서 획득하는
> 배지는 '체크인 배지'라 부른다(`Specs/UX_WRITING_GUIDELINE.md` 용어표). 코드·DB 식별자는
> `poi`를 그대로 유지한다 — 티켓 20260826_004 경계 규칙 2.

> **상태: 스텁 (미작성)** — 전용 컨텐츠 관리 문서가 없어 신설. 아래 소스를 기반으로 내용 채우기 필요.

## 데이터 소스 (현재 진실 소스)
- 스키마: `jam-web/supabase/migrations/001_initial_schema.sql` (`public.poi`)
- 카테고리 체계: `jam-web/supabase/migrations/050_poi_categories_table.sql`
- 검색 캐시: `jam-web/supabase/migrations/040_poi_search_cache.sql`
- 드랍/픽업 연동: `jam-web/supabase/migrations/004_phase7_user_drops.sql`
- 어뷰징 방지(POI 차단): `jam-web/supabase/migrations/010_abusing_policy.sql`
- 산 POI 일괄 등록: `scripts/import-mountains-poi.js` (산림청 공공데이터 연동)
- 지하철/기차역 POI 일괄 등록: `scripts/insert-stations-poi.js`
- 배지 이미지 자동 생성(재사용 프레임워크): `scripts/badge-image-gen/` — Figma 디자인 기반으로
  DB row(역명 등)마다 텍스트를 바꿔 배지 이미지를 대량 생성. 새 디자인은 `configs/*.config.js`
  하나만 추가하면 재사용됨. 사용법은 `scripts/badge-image-gen/README.md` 참고.
  (적용 이력: 지하철역 973개 `20260806_005_*`, 산 847개 + autoGrow 옵션 추가 `20260806_006_*`)
- 어드민 관리 화면: `jam-web/src/app/admin/poi/`
- 네이버 원본 분류 검증 게이트 + 어드민 검토 큐: `jam-web/supabase/migrations/143_poi_naver_category_review_gate.sql`, `jam-web/src/lib/poi/category-gate.ts`, 어드민 화면 `jam-web/src/app/admin/poi/review/`
- 자동수집 중단 데이터 변경([[20260907_1811]]): `jam-web/supabase/seed_20260907_poi_pipeline_linked_off.sql`

## 티어 구조 (기존 티켓 참고)
- T2: OSM/네이버 지역검색 기반 자동 수집 (편의점/카페 등) — **2026-09-07 전면 중단
      ([[20260907_1811]]).** 아래 "신규 등록 정책" 참고.
- T3: 향후 확장 예정 (Phase 14, 미착수)
- 산·지하철역 등 특수 POI: 공공데이터 일괄 등록

## 신규 등록 정책 (2026-09-07 갱신)

**자동수집(T2, 네이버 지역검색 기반)은 전면 중단됐고, 앞으로 신규 POI는 전부 수동등록이다**
([[20260907_1811]]). `poi_categories.pipeline_linked`가 T2 연동 10개 카테고리
(government/convenience/nature/tourist_attraction/stadium/school/park/hospital/
pharmacy/food) 전부 `false`로 전환됐다.

**중단 사유**: 네이버 지역검색 API가 좌표·반경 검색을 지원하지 않아(텍스트 검색+인기도순
`display=5`뿐) 실제 최근접 매장이 반경 500m 안에 들 확률이 낮고(실측 0~15%), 검증
게이트([[20260907_1242]])가 사실상 전 카테고리에서 꺼져 있었으며, "시청"·"국립공원"·
"전망대"·"시장"·"공원" 같은 포괄 명사 키워드가 무관한 상호명(파티룸·떡볶이집·생선회
음식점 등)을 다수 오염시킨 것이 실측·DB 확인으로 드러났다. 좌표기반 서드파티 대안도
검토했으나 전무하다 — NCP Maps는 좌표+반경 장소검색을 지원하지 않고, 카카오 로컬 API는
기술적으로 적합하나 이용정책상 검색결과 원본의 자체 DB 영구저장이 금지돼 있어(장소 데이터를
`poi` 테이블에 영구 저장해 배지 GPS 매칭·배지명 표시에 재사용하는 구조와 정면 충돌) 채택할
수 없었다. 상세 실측·검토 근거는 [[20260907_1811]] 참고.

**기존 자동수집 POI는 그대로 유지된다** — poi_tier=2(599건, 오늘 재분류 완료)·mountain(847)·
train_subway(967) 모두 지금 상태(활성/비활성) 그대로 두고, 검토 큐로 옮기거나 일괄
비활성화하지 않는다.

**신규 수동등록 흐름**: `/admin/poi/new`에서 등록하면 클라이언트 입력과 무관하게 항상
**임시등록(비활성 `is_active=false` · 검토대기 `pending_review=true`)** 으로 저장된다.
관리자가 `/admin/poi/review`(검토 큐)에서 이름을 눌러 `/admin/poi/[id]` 편집 화면으로
이동해 이름·좌표·반경·카테고리를 확인·수정한 뒤, 활성화 스위치를 켜고 저장해야 지도·드랍에
노출된다(저장 시 `is_active=true`이면 서버가 `pending_review`도 함께 `false`로 자동
해제한다). 검토 큐의 "승인" 버튼은 `pending_review`만 해제할 뿐 노출 여부는 바꾸지 않는다
— 노출(활성화)은 편집 화면에서만 명시적으로 이뤄진다.

자동수집 코드(`naver.ts`·`category-gate.ts`·`search-cache.ts`, `api/drops/route.ts`의
`searchAndPersistCategories`·`refreshPoisInBackground`)는 삭제하지 않고 남겨뒀다 —
향후 자동수집을 재개하기로 결정하면 재사용할 수 있다.

## 채워야 할 내용
- [ ] POI 카테고리 전체 목록과 티어 분류 기준
      (운영 기준 표는 `Specs/PRD/02_DATA_MODEL.md`의 poi_categories 절에 정리됨.
       2026-08-24에 `transit`에서 기차·지하철역 929개를 `train_subway`로 분리 — [[20260824_023]])
- [ ] 카테고리별 드랍/픽업 파이프라인 연동 규칙 (키워드·가중치)
- [ ] 지역별 POI 밀도/커버리지 현황
- [ ] 신규 POI 소스 추가 시 체크리스트
- [ ] 네이버 원본 분류 검증 게이트·어드민 검토 큐 운영 가이드 ([[20260907_1242]]) —
      카테고리별 allow/reject 패턴 튜닝 기준, 검토 큐 처리 SOP
- [x] 카테고리 체계 재정리 ([[20260907_1243]]) — 마이그레이션 144 적용 완료(2026-09-07).
      14종으로 정리: government·convenience·tourist_attraction·nature·stadium·school·
      park·hospital·pharmacy·food·mountain·train_subway·route·unassigned. 삭제:
      transit(POI 16건)·other(POI 3건→unassigned 이관). 통합: bike_route+trail→route.
      키워드 구조가 `text[]`→`jsonb({keyword,scope})`로 전환돼 카테고리 내에서도 키워드별
      지역단위(동/구/시도) 지정 가능
- [ ] 기존 POI 599건 재분류 (산·기차지하철 제외) — 스크립트(`scripts/reclassify-poi-categories.ts`)
      작성 완료, 실제 반영은 미리보기 확인 후 별도 승인 필요

## 관련 문서
- [BadgeEngine/BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) — POI 기반 배지 발급 로직
- 관련 티켓: `Tickets/20260726_006_*`, `20260727_001_*` (POI 일괄 등록 이력)
