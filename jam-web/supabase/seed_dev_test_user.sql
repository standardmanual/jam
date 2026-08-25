-- ============================================================
-- 개발/Staging 테스트 유저 시드
-- ⚠️  직접 실행하지 말 것 — 오케스트레이터(베이스캠프)가 사용자 승인 후 실행.
-- 참고: Ticket/20260812_004_Infra_로컬-개발서버-구글로그인-우회-테스트계정-도입.md
-- ============================================================
--
-- 고정값
--   auth.users / public.users UUID : 00000000-0000-0000-0000-000000000001
--   이메일                         : dev-tester@jam.local
--   route.ts(api/dev-login)와 반드시 동일한 값을 사용해야 한다.
--
-- 모든 INSERT는 ON CONFLICT DO NOTHING (idempotent)
-- 실제 배지·POI ID는 서브쿼리로 조회 — 시드 실행 시점의 DB 상태에 의존.
-- 조회 결과가 없으면 해당 행만 건너뜀 (배지 스킵돼도 유저/인벤토리는 생성됨).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. auth.users — GoTrue 인증 테이블에 테스트 유저 삽입
--    /api/dev-login 라우트의 createUser()와 중복 방지용 ON CONFLICT.
--    email_confirmed_at 을 설정해 이메일 인증 완료 상태로 만든다.
-- ────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev-tester@jam.local',
  '',                         -- 패스워드 없음 (magiclink 전용)
  NOW(),
  '{"full_name": "dev-tester"}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. public.users — 프로필
-- ────────────────────────────────────────────────────────────
INSERT INTO public.users (id, email, username, region, activity_types, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev-tester@jam.local',
  'dev.tester',
  '서울',
  ARRAY['cycling', 'running', 'hiking', 'walking'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. public.inventory — 인벤토리 (유저당 1개)
-- ────────────────────────────────────────────────────────────
INSERT INTO public.inventory (user_id, max_slots, used_slots, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 50, 0, NOW())
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. user_activity_badges — 액티비티 배지 3건
--    type='activity' 배지 중 앞 3개를 서브쿼리로 가져온다.
--    삭제(soft delete)되지 않은 배지만 대상으로 한다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_activity_badges (user_id, badge_id, earned_at, triggered_by)
SELECT
  '00000000-0000-0000-0000-000000000001',
  b.id,
  NOW() - (row_number() OVER (ORDER BY b.created_at) * INTERVAL '1 day'),
  'seed_dev'
FROM (
  SELECT id, created_at
  FROM public.badges
  WHERE type = 'activity'
    AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 3
) b
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. user_checkin_badge_earns — 체크인 배지 이력 2건
--    badges.type = 'checkin' + poi 테이블에 실제 지점이 있는 경우만.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_checkin_badge_earns (
  user_id, badge_id, poi_id, earned_at,
  triggered_by_strava_id, triggered_by_activity_name,
  triggered_by_distance_km, triggered_by_activity_date
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  pb.badge_id,
  pb.poi_id,
  NOW() - (row_number() OVER (ORDER BY pb.badge_created_at) * INTERVAL '3 days'),
  9999900 + row_number() OVER (ORDER BY pb.badge_created_at),  -- 가상 Strava activity ID
  '테스트 라이딩 (시드 데이터)',
  15.0,
  NOW() - (row_number() OVER (ORDER BY pb.badge_created_at) * INTERVAL '3 days')
FROM (
  SELECT b.id AS badge_id, p.id AS poi_id, b.created_at AS badge_created_at
  FROM public.badges b
  JOIN public.poi p ON p.linked_badge_id = b.id
  WHERE b.type = 'checkin'
  ORDER BY b.created_at
  LIMIT 2
) pb
ON CONFLICT (user_id, badge_id, poi_id, triggered_by_strava_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 6. inventory_items — 인벤토리 아이템 3건
--    type='item' 배지 중 앞 3개를 서브쿼리로 가져온다.
--    인벤토리가 4번에서 생성되었으므로 서브쿼리로 inventory_id 참조.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_at, obtained_by, expires_at)
SELECT
  inv.id,
  b.id,
  NOW() - (row_number() OVER (ORDER BY b.created_at) * INTERVAL '2 days'),
  'seed_dev',
  NOW() + INTERVAL '30 days'
FROM (
  SELECT id
  FROM public.inventory
  WHERE user_id = '00000000-0000-0000-0000-000000000001'
) inv
CROSS JOIN (
  SELECT id, created_at
  FROM public.badges
  WHERE type = 'item'
  ORDER BY created_at
  LIMIT 3
) b
ON CONFLICT DO NOTHING;

-- 인벤토리 used_slots 동기화
UPDATE public.inventory
SET used_slots = (
  SELECT COUNT(*) FROM public.inventory_items
  WHERE inventory_id = (
    SELECT id FROM public.inventory
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  )
)
WHERE user_id = '00000000-0000-0000-0000-000000000001';

COMMIT;

-- ============================================================
-- 실행 확인 쿼리 (실행 후 아래를 별도로 돌려볼 것)
-- ============================================================
-- SELECT 'users' AS tbl, COUNT(*) FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001'
-- UNION ALL
-- SELECT 'activity_badges', COUNT(*) FROM public.user_activity_badges WHERE user_id = '00000000-0000-0000-0000-000000000001'
-- UNION ALL
-- SELECT 'checkin_badge_earns', COUNT(*) FROM public.user_checkin_badge_earns WHERE user_id = '00000000-0000-0000-0000-000000000001'
-- UNION ALL
-- SELECT 'inventory_items', COUNT(*) FROM public.inventory_items WHERE inventory_id = (
--   SELECT id FROM public.inventory WHERE user_id = '00000000-0000-0000-0000-000000000001'
-- );
