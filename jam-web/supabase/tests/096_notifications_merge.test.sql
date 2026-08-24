-- 096_notifications.sql 적용 후 검증 스크립트 — 티켓 20260824_019
-- 스펙: Specs/PRD/Notification/DATA_MODEL.md §4 · §4-1
--
-- ⚠️ 이 파일은 **마이그레이션이 아니다.** supabase/migrations/ 에 두지 말 것.
--    096을 적용한 뒤 한 번 돌려 병합 규칙이 실제로 성립하는지 확인하는 용도다.
--
-- 실행:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/096_notifications_merge.test.sql
--   · 전부 BEGIN…ROLLBACK 안에서 돌아가므로 **데이터가 남지 않는다.**
--   · 실패하면 ASSERT가 예외를 던져 즉시 중단된다. 끝까지 가면 성공 NOTICE가 찍힌다.
--   · 기존 유저 3명을 빌려 쓴다(FK: users.id → auth.users.id 때문에 임시 유저를 못 만든다).
--     group_key에 '__test__' 접두를 붙여 실제 소식 묶음과 충돌하지 않게 했다.
--
-- 검증 항목
--   ① p_append_keys가 배열을 이어붙이고 중복을 제거하는가
--   ② actor_count가 병합 횟수가 아니라 **고유 인원**과 일치하는가
--   ③ #13이 6시간 창에서 badge_ids를 누적하는가 (얕은 병합이면 마지막 하나만 남는다)
--   ④ p_sum_keys 합산 · once 모드 · 행위자 없는 묶음의 actor_count 불변

BEGIN;

DO $$
DECLARE
  v_owner UUID;
  v_a     UUID;
  v_b     UUID;
  v_n     public.notifications;
  v_prev  TIMESTAMPTZ;
  v_gk_pick   TEXT := '__test__:drop_picked_up:2026-08-24-H2';
  v_gk_follow TEXT := '__test__:followed:2026-08-24';
  v_gk_points TEXT := '__test__:points_earned:2026-08-24';
  v_gk_badge  TEXT := '__test__:badge_earned:sync:1';
  v_gk_once   TEXT := '__test__:mission_milestone:m-1:50';
BEGIN
  SELECT id INTO v_owner FROM public.users ORDER BY created_at, id OFFSET 0 LIMIT 1;
  SELECT id INTO v_a     FROM public.users ORDER BY created_at, id OFFSET 1 LIMIT 1;
  SELECT id INTO v_b     FROM public.users ORDER BY created_at, id OFFSET 2 LIMIT 1;

  IF v_owner IS NULL OR v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION '검증에는 public.users 행이 3개 이상 필요합니다';
  END IF;

  -- =====================================================================
  -- ① · ② · ③  #13 픽업됨 — actor_ids · badge_ids 누적 (6시간 창)
  -- =====================================================================

  -- A가 첫 픽업
  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'drop_picked_up',
    p_payload => jsonb_build_object(
      'actor_ids', jsonb_build_array(v_a::text),
      'badge_ids', jsonb_build_array('badge-1'),
      'badge_name', '첫 배지', 'poi_id', 'poi-1'),
    p_bumps_badge => TRUE, p_actor_user_id => v_a, p_group_key => v_gk_pick,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids', 'badge_ids']);

  ASSERT v_n.actor_count = 1,
    format('① 첫 픽업의 actor_count는 1이어야 한다 (실제 %s)', v_n.actor_count);

  -- 같은 사람(A)이 같은 6시간 창에서 2건 더 픽업
  FOR i IN 2..3 LOOP
    v_n := public.create_notification(
      p_user_id => v_owner, p_type => 'drop_picked_up',
      p_payload => jsonb_build_object(
        'actor_ids', jsonb_build_array(v_a::text),
        'badge_ids', jsonb_build_array('badge-' || i),
        'badge_name', '배지' || i, 'poi_id', 'poi-1'),
      p_bumps_badge => TRUE, p_actor_user_id => v_a, p_group_key => v_gk_pick,
      p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids', 'badge_ids']);
  END LOOP;

  -- ② 병합 3회지만 인원은 1명 — 여기서 병합 횟수를 세면 "A님 외 2명"이라는 거짓말이 된다
  ASSERT v_n.actor_count = 1,
    format('② 한 사람이 3건을 픽업해도 actor_count는 1이어야 한다 (실제 %s)', v_n.actor_count);
  ASSERT jsonb_array_length(v_n.payload -> 'actor_ids') = 1,
    format('② actor_ids 중복 제거 실패 (실제 %s)', v_n.payload -> 'actor_ids');

  -- ③ 얕은 병합이었다면 badge_ids는 마지막 1개만 남는다
  ASSERT jsonb_array_length(v_n.payload -> 'badge_ids') = 3,
    format('③ badge_ids가 누적되지 않았다 (실제 %s)', v_n.payload -> 'badge_ids');
  ASSERT v_n.payload -> 'badge_ids' = '["badge-1","badge-2","badge-3"]'::jsonb,
    format('③ badge_ids 순서(기존→신규)가 어긋났다 (실제 %s)', v_n.payload -> 'badge_ids');

  -- 얕은 병합 대상(badge_name)은 최신 값으로 덮어써진다 — 단건일 때만 렌더에 쓰는 값
  ASSERT v_n.payload ->> 'badge_name' = '배지3',
    format('badge_name은 최신 값이어야 한다 (실제 %s)', v_n.payload ->> 'badge_name');

  -- B가 픽업 — 이제 고유 인원 2명
  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'drop_picked_up',
    p_payload => jsonb_build_object(
      'actor_ids', jsonb_build_array(v_b::text),
      'badge_ids', jsonb_build_array('badge-1'),   -- 이미 있는 값 → 중복 제거 대상
      'badge_name', '배지1', 'poi_id', 'poi-2'),
    p_bumps_badge => TRUE, p_actor_user_id => v_b, p_group_key => v_gk_pick,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids', 'badge_ids']);

  ASSERT v_n.actor_count = 2,
    format('② 서로 다른 2명이면 actor_count는 2여야 한다 (실제 %s)', v_n.actor_count);
  ASSERT jsonb_array_length(v_n.payload -> 'badge_ids') = 3,
    format('① 중복 badge_id가 제거되지 않았다 (실제 %s)', v_n.payload -> 'badge_ids');
  ASSERT v_n.actor_user_id = v_b,
    'actor_user_id는 가장 최근 행위자여야 한다';

  -- =====================================================================
  -- ①·②  #26 팔로우 — actor_ids만 append
  -- =====================================================================
  PERFORM public.create_notification(
    p_user_id => v_owner, p_type => 'followed',
    p_payload => jsonb_build_object('actor_ids', jsonb_build_array(v_a::text)),
    p_bumps_badge => TRUE, p_actor_user_id => v_a, p_group_key => v_gk_follow,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids']);

  -- 같은 사람이 언팔 후 재팔로우 — 인원이 늘면 안 된다
  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'followed',
    p_payload => jsonb_build_object('actor_ids', jsonb_build_array(v_a::text)),
    p_bumps_badge => TRUE, p_actor_user_id => v_a, p_group_key => v_gk_follow,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids']);
  ASSERT v_n.actor_count = 1,
    format('② 같은 사람의 재팔로우로 인원이 늘면 안 된다 (실제 %s)', v_n.actor_count);

  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'followed',
    p_payload => jsonb_build_object('actor_ids', jsonb_build_array(v_b::text)),
    p_bumps_badge => TRUE, p_actor_user_id => v_b, p_group_key => v_gk_follow,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['actor_ids']);
  ASSERT v_n.actor_count = 2,
    format('② 팔로우 고유 인원 2명이어야 한다 (실제 %s)', v_n.actor_count);

  -- =====================================================================
  -- ④-1  p_sum_keys — #5 포인트 적립 하루 합계
  -- =====================================================================
  PERFORM public.create_notification(
    p_user_id => v_owner, p_type => 'points_earned',
    p_payload => jsonb_build_object('amount', 250, 'reason', 'badge_point_reward'),
    p_bumps_badge => FALSE, p_actor_user_id => NULL, p_group_key => v_gk_points,
    p_mode => 'merge', p_sum_keys => ARRAY['amount'], p_append_keys => NULL);

  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'points_earned',
    p_payload => jsonb_build_object('amount', 300, 'reason', 'badge_point_reward'),
    p_bumps_badge => FALSE, p_actor_user_id => NULL, p_group_key => v_gk_points,
    p_mode => 'merge', p_sum_keys => ARRAY['amount'], p_append_keys => NULL);

  ASSERT (v_n.payload ->> 'amount')::int = 550,
    format('④ amount 합산 실패 — 550 기대, 실제 %s', v_n.payload ->> 'amount');

  -- =====================================================================
  -- ④-2  행위자 없는 묶음(#1 활동배지) — actor_count를 건드리지 않는다
  -- =====================================================================
  PERFORM public.create_notification(
    p_user_id => v_owner, p_type => 'badge_earned',
    p_payload => jsonb_build_object('badge_ids', jsonb_build_array('b1'), 'count', 1),
    p_bumps_badge => FALSE, p_actor_user_id => NULL, p_group_key => v_gk_badge,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['badge_ids']);

  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'badge_earned',
    p_payload => jsonb_build_object('badge_ids', jsonb_build_array('b2'), 'count', 1),
    p_bumps_badge => FALSE, p_actor_user_id => NULL, p_group_key => v_gk_badge,
    p_mode => 'merge', p_sum_keys => NULL, p_append_keys => ARRAY['badge_ids']);

  ASSERT v_n.actor_count = 1,
    format('④ 행위자 없는 묶음의 actor_count는 1로 남아야 한다 (실제 %s)', v_n.actor_count);
  ASSERT jsonb_array_length(v_n.payload -> 'badge_ids') = 2,
    format('④ badge_ids 누적 실패 (실제 %s)', v_n.payload -> 'badge_ids');
  ASSERT v_n.bumps_badge = FALSE,
    '④ 보상 획득 6종은 dot을 켜지 않는다';

  -- =====================================================================
  -- ④-3  once 모드 — 두 번째 호출이 updated_at을 건드리지 않는다
  -- =====================================================================
  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'mission_milestone',
    p_payload => jsonb_build_object('mission_id', 'm-1', 'milestone', 50),
    p_bumps_badge => TRUE, p_actor_user_id => NULL, p_group_key => v_gk_once,
    p_mode => 'once', p_sum_keys => NULL, p_append_keys => NULL);
  v_prev := v_n.updated_at;

  PERFORM pg_sleep(0.01);

  v_n := public.create_notification(
    p_user_id => v_owner, p_type => 'mission_milestone',
    p_payload => jsonb_build_object('mission_id', 'm-1', 'milestone', 50),
    p_bumps_badge => TRUE, p_actor_user_id => NULL, p_group_key => v_gk_once,
    p_mode => 'once', p_sum_keys => NULL, p_append_keys => NULL);

  ASSERT v_n.updated_at = v_prev,
    '④ once 모드가 updated_at을 갱신했다 — dot이 다시 켜져 반복 발송이 된다';

  ASSERT (SELECT count(*) FROM public.notifications
           WHERE user_id = v_owner AND group_key = v_gk_once) = 1,
    '④ once 모드가 행을 중복 생성했다';

  RAISE NOTICE '✅ 096 병합 규칙 검증 통과 — append 중복 제거 / actor_count 고유 인원 / badge_ids 누적 / sum / once';
END $$;

ROLLBACK;
