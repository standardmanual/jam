-- 165_michelin_poi_activate.sql
-- 미슐랭 POI 42곳을 검토 완료 처리하고 지도에 노출한다 (티켓 20260912_1025).
--
-- ⚠️ 실행 순서 — 반드시 아래 선행 조건을 모두 만족한 뒤에 실행할 것 (티켓 20260824_020의
--    "이미지 먼저 배포, DB 반영은 그 다음" 원칙과 동일한 이유):
--    1) 164_michelin_checkin_badges.sql이 먼저 실행되어 badges.category='michelin' 42건이
--       poi.linked_badge_id로 연결돼 있을 것.
--    2) scripts/badge-image-gen/configs/michelin-poi-badge.config.js로 생성한 커스텀 배지
--       이미지(public/badges/poi/michelin/*.png)가 커밋·배포되어 프로덕션에서 실제로
--       로드되는 것을 확인했을 것 — **이 세션에서는 Figma MCP 접근 권한이 없어 아직 완료되지
--       않았다**(구현 요약 alerts 참고). 완료 전에 이 마이그레이션을 실행하면 42개 체크인
--       배지가 커스텀 디자인 없이 공용 플레이스홀더(anyway_star.png) 이미지로 즉시
--       유저에게 노출된다.
--
-- 효과: `/admin/poi/review`의 "승인" 액션(`src/lib/admin/poi-review.ts`
-- `approvePendingPois`)과 동일하다 — michelin 카테고리는 `poi_categories.display_on_map=true`
-- 이므로 `pending_review=false`와 `is_active=true`를 함께 세팅한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙에 따라 **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후
--    오케스트레이터가(위 선행 조건 확인 후) 처리한다.

BEGIN;

UPDATE public.poi
SET pending_review = false,
    is_active = true
WHERE category = 'michelin'
  AND pending_review = true;

COMMIT;

-- ── 검증 쿼리 ──────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.poi WHERE category = 'michelin' AND is_active = true;  -- 42
-- SELECT count(*) FROM public.poi WHERE category = 'michelin' AND pending_review = true;  -- 0

-- ↩️ 롤백 DDL
--   UPDATE public.poi SET pending_review = true, is_active = false WHERE category = 'michelin';
