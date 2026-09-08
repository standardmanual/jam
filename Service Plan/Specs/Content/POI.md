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

## 티어 구조 (기존 티켓 참고)
- T2: OSM/네이버 지역검색 기반 자동 수집 (편의점/카페 등)
- T3: 향후 확장 예정 (Phase 14, 미착수)
- 산·지하철역 등 특수 POI: 공공데이터 일괄 등록

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
