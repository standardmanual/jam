-- 196: 온보딩 퀘스트 완료 배지 1종 신규 등록 — '퀘스트 클리어'
-- 티켓 20260928_1212(T7a, 상위 20260927_2130/20260927_2123) — 작성만, 실행은 사용자 승인 후
-- 오케스트레이터가 처리
--
-- 배경:
--   온보딩 퀘스트 완료 보상으로 줄 액티비티 배지 1종이 아직 DB에 없다. 지급 로직(T7b,
--   티켓 20260927_2130)이 이 배지 id로 `user_activity_badges`에 행을 넣는다 — 이 마이그레이션은
--   그 대상 배지 행만 만든다.
--
-- 표시 방식 (2026-09-28 사용자 결정 1):
--   새 플래그(`onboarding_reward`) 대신 기존 `condition_json.mission_reward = true`를
--   재사용한다. badge-engine은 이 플래그가 있는 배지를 발급 후보에서 항상 제외하므로(§2.7,
--   `evaluateBadgesDetailed`의 `mission_reward !== true` 필터), 동기화로 저절로 발급되지
--   않는다 — 새 예외 분기가 필요 없다. 대신 배지 상세 화면의 획득 조건 문장이 고정
--   문장("'퀘스트 클리어' 미션을 완료하면 받을 수 있는 배지예요.", `badgeConditionText.ts`)으로
--   나가고, 어드민에는 "미션 보상" 칩이 보인다 — 온보딩 전용 구분은 `admin_category = 'jam'`
--   과 배지 이름으로 한다.
--
-- 값 산정:
--   - `activity_types = '{}'`(NOT NULL 컬럼 기본값) — 특정 종목에 속하지 않는다.
--   - `family_key = 'onboarding:complete'` — 다른 배지와 겹치지 않는 전용 키.
--   - `admin_category = 'jam'` — 마이그레이션 156 선례(팔로워 수 등 JAM! 카테고리 배지 3종)와
--     같은 값 집합. badge-engine이 이 값도 함께 보고 후보에서 제외한다.
--   - `point_reward = 100` — 티켓 요구사항.
--   - `rarity = 'common'`, `level = NULL` — `badges_rarity_level_exclusive` CHECK
--     ((rarity IS NULL) = (level IS NOT NULL))를 만족한다.
--   - `image_url = NULL` — 대표 이미지는 행 등록 후 사용자가 어드민 액티비티 배지 이미지
--     생성기(`/admin/activity-badge-image`)로 직접 만든다(2026-09-28 사용자 결정 3).
--   - 이름·설명은 윈터 검수 결과(2026-09-28 확정)를 글자 단위로 그대로 옮겼다.
--
-- 확인한 DB 사실 (2026-09-28 카리나 조회, 티켓 본문 인용):
--   - `badges_condition_json_known_keys` CHECK에 `mission_reward`가 이미 있다.
--   - `badges_family_consistency` 트리거는 `mission_reward`가 true면 검사 없이 통과한다.
--   - `badges_admin_category_known_values`는 admin_category를 NULL 또는 'jam'만 허용한다.
--
-- 재실행 가능(idempotent): id를 고정 UUID로 박고 `ON CONFLICT (id) DO NOTHING`으로 작성했다.
--    같은 SQL을 다시 실행해도 행이 늘지 않는다.
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.

BEGIN;

INSERT INTO public.badges (
  id, name, description, type, rarity, level, activity_types,
  family_key, admin_category, point_reward, condition_json, image_url
) VALUES (
  'cd20f271-9445-42cc-ac51-d8a96b25e1c3',
  '퀘스트 클리어',
  '퀘스트를 모두 마친 증표입니다.',
  'activity',
  'common',
  NULL,
  '{}',
  'onboarding:complete',
  'jam',
  100,
  '{"mission_reward": true}'::jsonb,
  NULL
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 행이 정확히 1건, 값이 위 명세와 같은지
-- SELECT id, name, description, type, rarity, level, activity_types, family_key,
--        admin_category, point_reward, condition_json, image_url
--   FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';
--
-- -- ② 같은 SQL을 다시 실행해도 행이 늘지 않는지(재실행 후 여전히 1행)
-- SELECT count(*) FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';
--
-- -- ③ badge-engine 발급 후보에서 제외되는지 — mission_reward와 admin_category 둘 다 필터에
-- --    걸리므로 아래는 0행이어야 정상(`evaluateBadgesDetailed`가 쓰는 것과 같은 조건).
-- SELECT id FROM public.badges
--  WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
--    AND (condition_json->>'mission_reward')::boolean IS NOT TRUE
--    AND admin_category IS DISTINCT FROM 'jam';

-- 되돌림 SQL
-- (보유자가 0명일 때만 실행할 것 — 실행 전 아래로 먼저 확인)
-- SELECT count(*) FROM public.user_activity_badges WHERE badge_id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';
-- DELETE FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';
