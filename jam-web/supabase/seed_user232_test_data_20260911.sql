-- 스테이징 테스트: 유저 @232(UUID: 00000000-0000-0000-0000-000000000001)에게 샘플 배지·미션 데이터 생성 (2026-09-11)

BEGIN;

-- 활동형 배지 부여 (최대 3개)
INSERT INTO user_activity_badges (user_id, badge_id, earned_at, triggered_by_distance_km, triggered_by_activity_id)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as user_id,
  b.id,
  NOW()::timestamp as earned_at,
  10.5::numeric as triggered_by_distance_km,
  NULL::text as triggered_by_activity_id
FROM badges b
WHERE b.type = 'activity'
  AND b.id NOT IN (SELECT badge_id FROM user_activity_badges WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid)
LIMIT 3;

-- 아이템 배지 부여 (최대 2개)
INSERT INTO inventory_items (user_id, badge_id, acquired_at, quantity)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as user_id,
  b.id,
  NOW()::timestamp as acquired_at,
  1::integer as quantity
FROM badges b
WHERE b.type = 'item'
  AND b.id NOT IN (SELECT badge_id FROM inventory_items WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid)
LIMIT 2;

-- 체크인 배지 부여 (최대 1개)
INSERT INTO user_checkin_badge_earns (user_id, badge_id, earned_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as user_id,
  b.id,
  NOW()::timestamp as earned_at
FROM badges b
WHERE b.type = 'checkin'
  AND b.id NOT IN (SELECT badge_id FROM user_checkin_badge_earns WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid)
LIMIT 1;

-- 미션 참가 (최대 3개)
INSERT INTO user_mission_participations (user_id, mission_id, joined_at, progress_value)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid as user_id,
  m.id,
  NOW()::timestamp as joined_at,
  0::integer as progress_value
FROM missions m
WHERE m.ends_at > NOW()
  AND m.id NOT IN (SELECT mission_id FROM user_mission_participations WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid)
LIMIT 3;

-- 미션 완료 (최대 1개 - 참가 미션 중 하나)
INSERT INTO user_mission_completions (user_id, mission_id, completed_at)
SELECT
  ump.user_id,
  ump.mission_id,
  NOW()::timestamp as completed_at
FROM user_mission_participations ump
WHERE ump.user_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND ump.mission_id NOT IN (SELECT mission_id FROM user_mission_completions WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid)
LIMIT 1;

COMMIT;
