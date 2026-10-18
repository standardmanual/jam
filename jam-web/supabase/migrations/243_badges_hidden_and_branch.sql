-- 243_badges_hidden_and_branch.sql
-- JAM 2.0 액티비티 배지의 숨김 칸과 가지 분류 칸 (티켓 20261018_1815 3회, 운영 로직 10.2·10.3절)
--
-- 전부 덧붙이기다. badges에 새 칸 둘(is_hidden, branch_key)과 새 제약 셋을 더한다. 옛 칸·옛 제약의 뜻은 바꾸지 않는다.
-- 옛 프로덕션 코드는 새 칸을 읽거나 쓰지 않는다. 기본값(is_hidden = false, branch_key = NULL)이 지금 동작이라 기존 배지 행은 그대로 새 제약을 통과한다.
--
-- 규칙
--   - is_hidden: 숨김 배지. 받기 전에는 배지함·트리·다음 목표·상세 어디에도 이름·조건이 보이지 않고 개수도 알리지 않는다(앱의 서버 응답이 거른다).
--   - 숨김 배지는 액티비티 배지에만 쓴다(type = 'activity'), 포인트는 0이고, 등급이 있으면 Common만 둔다(등급이 없는 레벨형은 NULL).
--     이 셋은 DB 제약으로 막는다(어드민 폼이 실수해도 저장되지 않는다).
--   - branch_key: 배지 트리의 가지 분류(기획과 어드민의 분류, 화면 표기는 4-6). 값 일곱 가지 중 하나 또는 NULL(분류 없음):
--       rhythm(리듬), recovery(회복), time_season(시간과 계절), explore(탐험), attribute(운동 속성), milestone(이정표), jam_activity(JAM 활동).
--     가지가 더 늘면 이 제약을 넓히는 마이그레이션을 따로 둔다.
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='badges' AND column_name IN ('is_hidden', 'branch_key');          -- 2행, false / NULL
--   SELECT count(*) FILTER (WHERE is_hidden) AS hidden, count(*) FILTER (WHERE branch_key IS NOT NULL) AS branched FROM public.badges;  -- 0, 0
--   SELECT conname FROM pg_constraint WHERE conrelid='public.badges'::regclass AND conname IN ('badges_branch_key_known', 'badges_hidden_activity_only', 'badges_hidden_no_points', 'badges_hidden_common_only');  -- 4행

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS branch_key TEXT;

COMMENT ON COLUMN public.badges.is_hidden IS
  '숨김 배지(운영 로직 10.3절). true면 받기 전까지 배지함·트리·다음 목표·상세에 보이지 않고 개수도 알리지 않는다. 액티비티 배지만, 포인트 0, 등급은 Common만. 기본 false.';
COMMENT ON COLUMN public.badges.branch_key IS
  '배지 트리의 가지 분류: rhythm·recovery·time_season·explore·attribute·milestone·jam_activity 또는 NULL(분류 없음). 화면 표기는 앱이 정한다.';

ALTER TABLE public.badges
  ADD CONSTRAINT badges_branch_key_known CHECK (
    branch_key IS NULL
    OR branch_key IN ('rhythm', 'recovery', 'time_season', 'explore', 'attribute', 'milestone', 'jam_activity')
  );

ALTER TABLE public.badges
  ADD CONSTRAINT badges_hidden_activity_only CHECK (NOT is_hidden OR type = 'activity');

ALTER TABLE public.badges
  ADD CONSTRAINT badges_hidden_no_points CHECK (NOT is_hidden OR point_reward = 0);

ALTER TABLE public.badges
  ADD CONSTRAINT badges_hidden_common_only CHECK (NOT is_hidden OR rarity IS NULL OR rarity = 'common');

-- 되돌림 SQL
-- 새 제약과 칸을 지운다. 숨김 배지가 이미 있으면 되돌리는 순간 그 배지가 모두에게 보이게 되므로, 먼저 숨김 배지가 0건인지 확인하거나 어떻게 할지 정한다:
-- SELECT count(*) FROM public.badges WHERE is_hidden;
-- ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_hidden_common_only;
-- ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_hidden_no_points;
-- ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_hidden_activity_only;
-- ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_branch_key_known;
-- ALTER TABLE public.badges DROP COLUMN IF EXISTS branch_key;
-- ALTER TABLE public.badges DROP COLUMN IF EXISTS is_hidden;
-- 이 칸을 쓰는 새 코드(숨김 거르기, 어드민 폼)는 같은 시점에 되돌려야 한다.
