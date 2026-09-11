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
-- ⚠️ 2026-09-11 게이트 리뷰 FAIL로 수정: 마이그레이션 143(`requires_review BOOLEAN NOT NULL
-- DEFAULT false`) 이후 이 10개 카테고리의 requires_review를 true로 켠 마이그레이션/시드가
-- 하나도 없다 — 09-07 오전 티켓도 "기본 꺼짐, 지도 노출 카테고리 위주로 켜는 것을 권장"이라고만
-- 적었을 뿐 실제로 켜지는 않았다. requires_review가 전부 false인 채로는
-- `jam-web/src/app/api/drops/route.ts`의 gatePois(66~78행)가 `classifyNaverCategory`를
-- 아예 호출하지 않고 무조건 verdict='approved'로 처리해(73행,
-- `requiresReview ? classifyNaverCategory(...) : 'approved'`), 검토 큐(`pending_review=true`)에
-- 아무것도 쌓이지 않고 지도 노출 카테고리(is_active=true)는 검증 없이 바로 노출된다 —
-- pipeline_linked만 복원해서는 09-07 오전에 의도한 "검토 큐 방식"이 재현되지 않는다.
-- 그래서 pipeline_linked 복원과 함께 이번 10개 카테고리 전부 requires_review도 true로 켠다.

UPDATE public.poi_categories
SET pipeline_linked = true,
    requires_review = true
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
--   -- 전부 pipeline_linked=true, requires_review=true여야 한다.

-- ↩️ 롤백: jam-web/supabase/seed_20260907_poi_pipeline_linked_off.sql 재실행
--    (단, requires_review는 그 파일이 건드리지 않으므로 완전 원복하려면 별도로
--    `UPDATE public.poi_categories SET requires_review = false WHERE slug IN (...)`를
--    함께 실행해야 한다 — 09-07 저녁 이전 상태도 어차피 requires_review=false였으므로
--    엄밀히는 "이번 변경 이전" 원복이 아니라 "09-07 저녁 이전(자동수집 켜짐+게이트 꺼짐)"
--    상태로 돌아간다는 점에 유의.)
