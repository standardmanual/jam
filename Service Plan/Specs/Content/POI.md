# 장소 (POI) 컨텐츠 관리

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
  (지하철역 POI 배지 973개 최초 적용 이력: `History/Migration/Ticket/20260806_005_*`)
- 어드민 관리 화면: `jam-web/src/app/admin/poi/`

## 티어 구조 (기존 티켓 참고)
- T2: OSM/네이버 지역검색 기반 자동 수집 (편의점/카페 등)
- T3: 향후 확장 예정 (Phase 14, 미착수)
- 산·지하철역 등 특수 POI: 공공데이터 일괄 등록

## 채워야 할 내용
- [ ] POI 카테고리 전체 목록과 티어 분류 기준
- [ ] 카테고리별 드랍/픽업 파이프라인 연동 규칙 (키워드·가중치)
- [ ] 지역별 POI 밀도/커버리지 현황
- [ ] 신규 POI 소스 추가 시 체크리스트

## 관련 문서
- [BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) — POI 기반 배지 발급 로직
- 관련 티켓: `History/Migration/Ticket/20260726_006_*`, `20260727_001_*` (POI 일괄 등록 이력)
