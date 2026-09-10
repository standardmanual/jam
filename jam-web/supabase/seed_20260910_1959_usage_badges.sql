-- seed_20260910_1959_usage_badges.sql — JAM! 카테고리 사용량 배지 3종 신규 생성
--   (팔로워 10,000명 · 팔로잉 10,000명 · 하루 동기화 1,000,000회) — 티켓 20260910_1959
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경: 티켓 20260910_1557이 서비스 사용량(팔로워 수·팔로잉 수·일일 동기화 횟수) 조건으로
--   배지를 만들 수 있는 엔진(usageBadges.ts, 마이그레이션 154·155)을 완성했지만, 실제 배지
--   콘텐츠는 의도적으로 범위 밖에 뒀다. 그 결과 DB에는 이 조건을 쓰는 배지가 0건이라 엔진은
--   배포됐지만 실질적으로 아무 효과가 없었다. 이 시드가 지표당 1개씩, 총 3개를 최초로 채운다.
--
-- daily_sync_count: 1,000,000은 오타가 아니다 — 사용자가 명시적으로 확인한 값이며, 스트라바
--   동기화 횟수로는 사실상 영원히 달성 불가능한 히든/전설급 조건으로 의도됐다.
--
-- 이름·설명은 한국어 리뷰(humanize-korean) 대안 반영본이다. 최초 가제(티켓 원문)는 수 분류사
--   오류("손짓"을 '개'로 셈)와 이름·설명 방향 역전("닿지 않는 하루"가 부정형이라 목록에서
--   미획득 배지로 오독될 위험)이 있어 교체했다 — 조건값·등급·구조는 티켓 그대로다.
--
-- 비활성 상태로 우선 등록: 배지 이미지가 아직 없다(실제 이미지 제작은 /jam-img 파이프라인의
--   별도 후속 작업 — 사용자가 Gemini에 직접 프롬프트를 입력해야 하는 수작업이라 이번 범위 밖).
--   이미지 없이 활성 상태로 두면 유저 화면(/badges)에 깨진 이미지가 그대로 노출되므로, 최초
--   insert 시 deleted_at을 현재 시각으로 채워 비활성(소프트 삭제) 상태로 만든다. 어드민
--   배지 목록에서는 "비활성화" 상태로 계속 조회·검색된다. 이미지가 준비되면 별도 작업으로
--   deleted_at을 NULL로 되돌려 활성화한다(이 파일의 범위 밖).
--
-- type='activity' · activity_types=[]: 배지 트리(/badges/tree)에는 노출하지 않고 일반
--   목록(/badges)·프로필에는 노출하는 기존 설계를 그대로 따른다(티켓 20260910_1557,
--   BADGE_ENGINE_UNIFIED.md §1 "③ JAM! 카테고리"). tribe_id는 트라이브 종속이 아닌 서비스
--   전역 지표이므로 지정하지 않는다(NULL, 컬럼 기본값).
--
-- rarity='mystic' 단일 등급: 하위 등급(common·rare·epic)은 이번 범위에 없다. usageBadges.ts의
--   등급형 평가는 같은 이름(name) 그룹 안에서 미보유 + 조건 충족 중 최상위 tier 1개만 발급하는
--   방식이라, 이름별로 정확히 1개 tier(mystic)만 있어도 정상 동작한다(하위 tier 부재가 판정을
--   막지 않는다).
--
-- ── 실행 전 확인 (중복 방지) ────────────────────────────────────────────────
--   SELECT id, name, condition_json FROM public.badges
--    WHERE condition_json ? 'follower_count'
--       OR condition_json ? 'following_count'
--       OR condition_json ? 'daily_sync_count';
--   → 0행이어야 이 INSERT가 안전하다. 1행 이상이면 오케스트레이터가 먼저 확인할 것.
--
-- 재실행 가능(idempotent): 각 INSERT는 해당 metric 키를 가진 배지가 이미 있으면 건너뛴다.

BEGIN;

-- ① follower_count: 10,000 — "만 명의 시선"
INSERT INTO public.badges (
  name, description, type, rarity, activity_types, condition_json, deleted_at
)
SELECT '만 명의 시선',
       '혼자 시작한 길을 만 명이 지켜봅니다.',
       'activity'::badge_type, 'mystic'::badge_rarity,
       ARRAY[]::text[], '{"follower_count":10000}'::jsonb, now()
 WHERE NOT EXISTS (
   SELECT 1 FROM public.badges WHERE type = 'activity' AND condition_json ? 'follower_count'
 );

-- ② following_count: 10,000 — "만 번의 손짓"
INSERT INTO public.badges (
  name, description, type, rarity, activity_types, condition_json, deleted_at
)
SELECT '만 번의 손짓',
       '먼저 손 내민 횟수가 만 번을 넘겼습니다.',
       'activity'::badge_type, 'mystic'::badge_rarity,
       ARRAY[]::text[], '{"following_count":10000}'::jsonb, now()
 WHERE NOT EXISTS (
   SELECT 1 FROM public.badges WHERE type = 'activity' AND condition_json ? 'following_count'
 );

-- ③ daily_sync_count: 1,000,000 — "백만 번의 동기화" (오타 아님 — 위 설명 참고)
INSERT INTO public.badges (
  name, description, type, rarity, activity_types, condition_json, deleted_at
)
SELECT '백만 번의 동기화',
       '하루 동안 동기화를 백만 번. 아직 아무도 닿지 못했습니다.',
       'activity'::badge_type, 'mystic'::badge_rarity,
       ARRAY[]::text[], '{"daily_sync_count":1000000}'::jsonb, now()
 WHERE NOT EXISTS (
   SELECT 1 FROM public.badges WHERE type = 'activity' AND condition_json ? 'daily_sync_count'
 );

COMMIT;

-- 확인용:
-- SELECT id, name, description, type, rarity, activity_types, tribe_id, condition_json, deleted_at
--   FROM public.badges
--  WHERE condition_json ? 'follower_count'
--     OR condition_json ? 'following_count'
--     OR condition_json ? 'daily_sync_count'
--  ORDER BY name;
-- → 3행이어야 하고, 전부 type='activity' · rarity='mystic' · activity_types='{}' ·
--   tribe_id IS NULL · deleted_at IS NOT NULL(비활성)이어야 한다.

-- ↩️ 롤백 — 이 시드가 넣은 행만 지운다 (발급 이력이 없는 신규 배지라 실삭제 가능)
-- DELETE FROM public.badges
--  WHERE type = 'activity' AND rarity = 'mystic'
--    AND name IN ('만 명의 시선', '만 번의 손짓', '백만 번의 동기화')
--    AND (
--      condition_json ? 'follower_count'
--      OR condition_json ? 'following_count'
--      OR condition_json ? 'daily_sync_count'
--    );
