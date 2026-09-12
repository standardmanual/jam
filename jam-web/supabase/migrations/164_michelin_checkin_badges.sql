-- 164_michelin_checkin_badges.sql
-- 미슐랭 POI 42곳에 체크인 배지(type='checkin')를 1:1로 생성하고
-- poi.linked_badge_id로 연결한다 (티켓 20260912_1025).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 대상: seed_poi_michelin_seoul_2026.sql(티켓 20260912_0115)로 등록된
--   poi.category='michelin' 42곳 전체. WHERE 절이 linked_badge_id IS NULL인 행만
--   골라내므로 재실행해도 이미 연결된 행은 건드리지 않는다(멱등).
--
-- 패턴은 기존 mountain·train_subway 체크인 배지 일괄 생성(2026-07-27,
-- BADGE_ENGINE_UNIFIED.md §3.14)과 동일하다:
--   - 이름 = POI 이름 그대로
--   - 설명 = 자동 생성. "체크인" 용어를 UX_WRITING_GUIDELINE에 맞춰 쓰되(X: 방문·확인),
--     기존 배지들도 실제로는 "올랐습니다"/"지나갔습니다" 같은 상황별 동사를 써서 이 규칙을
--     지켜왔으므로 레스토랑에는 "식사했습니다"를 쓴다. "에서" 부사격 조사를 쓰면 을/를
--     받침 분기가 필요 없다.
--   - rarity = 'common' (기존 체크인 배지와 동일 등급 정책 — 별도 등급 스펙 없음)
--   - badges.category = 'michelin' (마이그레이션 113, 지점 카테고리 태깅. poi.linked_badge_id
--     연결과는 별개 개념)
--
-- image_url: 커스텀 디자인(Figma fileKey UXcBEgFagmO5ARwH5F0mMW, node 15:127, 텍스트 레이어
--   15:113 'POI')을 이 세션에서는 Figma MCP 접근 권한이 없어 생성하지 못했다(구현 요약
--   alerts 참고, 후속 세션 필요). 최초 체크인 배지 일괄 생성(2026-07-27) 당시와 동일하게
--   공용 플레이스홀더 '/badges/poi/anyway_star.png'로 우선 채운다. 커스텀 이미지가 준비되면
--   scripts/badge-image-gen/generate.js michelin-poi-badge 실행 결과 SQL로 개별 반영한다
--   (public/badges/poi/michelin/*.png가 프로덕션에 배포된 뒤에 image_url을 갱신할 것 —
--   [[20260824_020]] 순서 사고 재발 방지).
--
-- poi.is_active 활성화는 이 마이그레이션의 범위가 아니다 — 커스텀 이미지 배포 확인 후
-- 165_michelin_poi_activate.sql로 별도 처리한다.

BEGIN;

WITH new_badges AS (
  INSERT INTO public.badges (name, description, type, rarity, image_url, activity_types, patch_available, category)
  SELECT
    p.name,
    p.name || '에서 식사했습니다',
    'checkin',
    'common',
    '/badges/poi/anyway_star.png',
    '{}',
    false,
    'michelin'
  FROM public.poi p
  WHERE p.category = 'michelin'
    AND p.linked_badge_id IS NULL
  RETURNING id, name
)
UPDATE public.poi p
SET linked_badge_id = nb.id
FROM new_badges nb
WHERE p.category = 'michelin'
  AND p.name = nb.name
  AND p.linked_badge_id IS NULL;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 42곳 전부 연결됐는지 (42행이어야 한다)
-- SELECT count(*) FROM public.poi WHERE category = 'michelin' AND linked_badge_id IS NOT NULL;
--
-- -- ② badges 쪽도 1:1로 정확히 생겼는지 (42행, 중복 없이)
-- SELECT count(*) FROM public.badges WHERE category = 'michelin' AND type = 'checkin';
--
-- -- ③ 이름 매칭 사고(동명 POI)가 없었는지 — 두 결과가 같은 42여야 한다
-- SELECT count(DISTINCT p.linked_badge_id) FROM public.poi p WHERE p.category = 'michelin';

-- ↩️ 롤백 DDL (활성화 전, 커스텀 이미지 반영 전 단계에서만 안전)
--   UPDATE public.poi SET linked_badge_id = NULL WHERE category = 'michelin';
--   DELETE FROM public.badges WHERE category = 'michelin' AND type = 'checkin'
--     AND image_url = '/badges/poi/anyway_star.png';
