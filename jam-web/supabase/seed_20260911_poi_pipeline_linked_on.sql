-- 티켓 20260911_1310 [Infra] POI 자동수집을 검토 큐 방식으로 재개
--
-- 순수 데이터 변경(스키마 변경 없음). 2026-09-07 저녁(`20260907_1811`)에
-- pipeline_linked=false로 전환됐던 T2 자동수집 연동 10개 카테고리
-- (government/convenience/nature/tourist_attraction/stadium/school/park/
-- hospital/pharmacy/food)를 다시 true로 복원해 자동수집을 재개한다.
--
-- 배경: 09-07 오전(`20260907_1242`)에 도입된 네이버 원본 분류 검증 게이트 + 어드민 검토 큐
-- (`jam-web/src/app/api/drops/route.ts`의 searchAndPersistCategories 119~140행,
-- `jam-web/src/lib/poi/categories.ts`의 loadPipelineCategories)는 09-07 저녁 이후 코드
-- 변경 없이 그대로 남아 있다. 자동수집이 멈춘 원인은 코드가 아니라 이 pipeline_linked 플래그
-- 하나였다 — 복원만으로 검증 게이트·검토 큐 로직이 재활성화된다.
--
-- 09-07 저녁 티켓이 지적한 네이버 지역검색 API의 반경검색 미지원·포괄 키워드로 인한 명칭
-- 오염 문제는 이번 범위에서 해결하지 않는다. 같은 품질 이슈가 재발할 수 있음을 인지한
-- 상태로 정책만 복귀한다 — 상세 근거는 `Service Plan/Tickets/P1-중요/
-- 20260911_1310_Infra_POI-자동수집-검토큐-방식-재개.md` 참고.
--
-- mountain·train_subway(마이그레이션 144에서 별도 사유로 pipeline_linked=false 전환)는
-- 이번 복원 대상이 아니다 — 그대로 둔다.
--
-- 이미 poi_categories.requires_review·display_on_map 값은 09-07 오전/저녁 어느 티켓에서도
-- 건드리지 않았으므로 이번에도 손대지 않는다(카테고리별 기존 값 유지).

UPDATE public.poi_categories
SET pipeline_linked = true
WHERE slug IN (
  'government', 'convenience', 'nature', 'tourist_attraction', 'stadium',
  'school', 'park', 'hospital', 'pharmacy', 'food'
);

-- 🧪 적용 후 검증
--   SELECT slug, pipeline_linked, requires_review, display_on_map
--     FROM public.poi_categories
--     WHERE slug IN ('government','convenience','nature','tourist_attraction','stadium',
--                     'school','park','hospital','pharmacy','food')
--     ORDER BY slug;
--   -- 전부 pipeline_linked=true여야 한다.

-- ↩️ 롤백: jam-web/supabase/seed_20260907_poi_pipeline_linked_off.sql 재실행
