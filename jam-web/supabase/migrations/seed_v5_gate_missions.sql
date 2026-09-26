-- seed_v5_gate_missions.sql — 게이트 미션 40종(걷기 8 + 4종목 32) 시딩 (티켓 20260906_2231)
--
-- 생성: v5_mission_seed_build.py. 대상: 53행(축 기준) / 40종(보상 배지 기준).
-- 축→미션코드 매핑은 v5_gate_build.py(1947)의 MISSION_MAP을 그대로 재사용했다(재작업 없음).
--
-- 티켓 20260927_0026: 설명은 산문, 달성 조건 문장은 condition_text 칸(193_missions_condition_text.sql)에 넣는다.
-- 이 INSERT는 193 적용 뒤에만 실행할 수 있다. 이미 시딩된 운영 DB는 194_missions_condition_text_backfill.sql로 갱신한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ⚠️ 실행 전 반드시 확인 — 이 파일은 "missions 테이블이 이 40종 관련 행을 하나도 갖고
--    있지 않다"는 전제로 INSERT만 한다. 마이그레이션 135 하단 주석(2026-09-05 사용자 확정,
--    판단 ②)은 "v5 미션 40개를 새로 만든다"고 명시했고 레거시 게이트 미션 15개(gate_axis
--    없이 gated_badge_id만 있는 행)는 폐기 대상이라고 남겼다 — 그 폐기가 이미 됐는지,
--    또는 이 40종에 해당하는 행이 다른 형태로 이미 존재하는지(예: 걷기 8종이 gate_axis 없이
--    먼저 시딩됐을 가능성) 아래 SELECT로 먼저 확인할 것. 있다면 이 INSERT 전에 정리가
--    필요하다(중복 미션이 생기면 같은 보상 배지를 두 경로로 지급하게 된다).
--
--   SELECT id, title, mission_type, gate_axis, gated_badge_id, reward_badge_ids FROM public.missions
--    WHERE title = ANY(ARRAY['계절의 증명','긴 산행의 증명','내리막 뒤의 증명','높이의 증명','누적의 증명','눈과 볕의 증명','돌아오는 산의 증명','리듬의 증명','먼 하루의 증명','바퀴 자국의 증명','반복의 증명','발길의 증명','빈 안장의 증명','사계의 증명','사철 산길의 증명','속도의 증명','수직의 증명','쉼표의 증명','시간의 증명','시간표의 증명','쌓인 거리의 증명','쌓인 고도의 증명','언덕의 증명','연속의 증명','연이은 날의 증명','오르내린 거리의 증명','오르막의 증명','요일의 증명','울트라의 증명','이어 달린 산길의 증명','이어진 능선의 증명','이어진 바퀴의 증명','이정표의 증명','주말의 증명','지평선의 증명','추위와 더위의 증명','페이스의 증명','하산 뒤의 증명','해뜨기 전의 증명','회복의 증명']::text[]);
--   → 0행이어야 이 INSERT가 안전하다. 1행 이상이면 오케스트레이터가 먼저 처리할 것.
--
BEGIN;

-- cycling:간격 → cycling:Q6 (이어진 바퀴의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이어진 바퀴의 증명', '굴러가는 바퀴의 흐름이 끊기지 않았음을 보여 주세요', '4주 동안 매주 1번 이상 타고, 3일 연속 타는 날을 한 번 만들기', 'engine_condition', '{"activity_type": "cycling", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:간격', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:G1"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:강도 → cycling:Q2 (속도의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '속도의 증명', '멀리 가고도 속도를 놓지 않는 라이더임을 증명하세요', '4주 안에 한 번에 30km 이상을 평균 25km/h 이상으로, 3번 타기', 'engine_condition', '{"activity_type": "cycling", "single_distance_km": 30, "min_speed_kmh": 25, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:강도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:P1"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:고도 → cycling:Q4 (언덕의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '언덕의 증명', '언덕을 넘고 또 넘는 다리 힘을 증명하세요', '4주 안에 한 번에 상승고도 1,200m 이상, 2번 타기', 'engine_condition', '{"activity_type": "cycling", "single_elevation_m": 1200, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:고도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:E1"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:누적 → cycling:Q1 (바퀴 자국의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '바퀴 자국의 증명', '길 위에 길게 남긴 바퀴 자국을 증명하세요', '2주 안에 330km 타기', 'engine_condition', '{"activity_type": "cycling", "distance_km": 330}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:누적', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 6}}'::jsonb
);

-- cycling:단일 최대 → cycling:Q3 (지평선의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '지평선의 증명', '지평선이 보일 만큼 멀리 나가 보세요', '4주 안에 한 번에 130km 이상, 2번 타기', 'engine_condition', '{"activity_type": "cycling", "single_distance_km": 130, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q3'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:단일 최대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:L1"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:달력 → cycling:Q8 (추위와 더위의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '추위와 더위의 증명', '달을 바꿔 가며 굴린 페달의 뚝심을 보여 주세요', '서로 다른 두 달에 각각 500km 타기', 'engine_condition', '{"activity_type": "cycling", "distinct_months_required": 2, "distinct_months_metric": "distance_km", "distinct_months_threshold": 500}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q8'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:달력', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:연속 → cycling:Q6 (이어진 바퀴의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이어진 바퀴의 증명', '굴러가는 바퀴의 흐름이 끊기지 않았음을 보여 주세요', '4주 동안 매주 1번 이상 타고, 3일 연속 타는 날을 한 번 만들기', 'engine_condition', '{"activity_type": "cycling", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:연속', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:요일 → cycling:Q5 (주말의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '주말의 증명', '주말마다 안장에 오르는 사람임을 증명하세요', '3주 연속, 한 주에 3번 타고 매주 주말에 1번 이상 타기', 'engine_condition', '{"activity_type": "cycling", "weekly_streak": 3, "weekly_streak_min_count": 3, "streak_subset": {"day_of_week": ["saturday", "sunday"], "min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:요일', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:D1", "cycling:D2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:D1", "cycling:D2"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:이정표 → cycling:Q1 (바퀴 자국의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '바퀴 자국의 증명', '길 위에 길게 남긴 바퀴 자국을 증명하세요', '2주 안에 330km 타기', 'engine_condition', '{"activity_type": "cycling", "distance_km": 330}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:이정표', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:주기 → cycling:Q5 (주말의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '주말의 증명', '주말마다 안장에 오르는 사람임을 증명하세요', '3주 연속, 한 주에 3번 타고 매주 주말에 1번 이상 타기', 'engine_condition', '{"activity_type": "cycling", "weekly_streak": 3, "weekly_streak_min_count": 3, "streak_subset": {"day_of_week": ["saturday", "sunday"], "min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:주기', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:최고 도달 → cycling:Q2 (속도의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '속도의 증명', '멀리 가고도 속도를 놓지 않는 라이더임을 증명하세요', '4주 안에 한 번에 30km 이상을 평균 25km/h 이상으로, 3번 타기', 'engine_condition', '{"activity_type": "cycling", "single_distance_km": 30, "min_speed_kmh": 25, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:최고 도달', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:V1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:V1"], "min_rarity": "mystic"}}'::jsonb
);

-- cycling:휴식 → cycling:Q7 (빈 안장의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '빈 안장의 증명', '안장을 비워 두는 하루까지 증명하세요', '8주 안에 한 번에 100km 이상 타고 다음 날 휴식이 있었던 경우 3번', 'engine_condition', '{"activity_type": "cycling", "single_distance_km": 100, "rest_after_long": 1, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q7'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'cycling:휴식', 'epic_to_mystic', '{"require_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:간격 → hiking:Q6 (돌아오는 산의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '돌아오는 산의 증명', '계절이 지나도 산으로 돌아오는 사람임을 증명하세요', '6개월 연속, 한 달에 2번 이상 산행하기', 'engine_condition', '{"activity_type": "hiking", "monthly_streak": 6, "monthly_streak_min_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:간격', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:G1"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:강도 → hiking:Q2 (높이의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '높이의 증명', '발밑이 아득해지는 높이까지 한 번에 올라 보세요', '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 산행하기', 'engine_condition', '{"activity_type": "hiking", "single_elevation_m": 1000, "max_elevation_m": 1200, "same_activity": true}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:강도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:P1"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:누적 → hiking:Q1 (쌓인 고도의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '쌓인 고도의 증명', '한 걸음씩 쌓아 올린 높이를 증명하세요', '2개월 안에 상승고도 5,000m 산행하기', 'engine_condition', '{"activity_type": "hiking", "elevation_gain_m": 5000}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:누적', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 6}}'::jsonb
);

-- hiking:단일 최대 → hiking:Q3 (긴 산행의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '긴 산행의 증명', '산에서 긴 하루를 보낸 날을 증명하세요', '3개월 안에 한 번에 6시간 이상, 2번 산행하기', 'engine_condition', '{"activity_type": "hiking", "duration_minutes": 360, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q3'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:단일 최대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:달력 → hiking:Q8 (눈과 볕의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '눈과 볕의 증명', '다른 달, 다른 얼굴의 산을 모두 올라 보세요', '서로 다른 두 달에 각각 상승고도 1,800m 산행하기', 'engine_condition', '{"activity_type": "hiking", "distinct_months_required": 2, "distinct_months_metric": "elevation_gain_m", "distinct_months_threshold": 1800}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q8'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:달력', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:연속 → hiking:Q5 (이어진 능선의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이어진 능선의 증명', '하루도 끊지 않고 산으로 향해 보세요', '3일 연속 산행하기', 'engine_condition', '{"activity_type": "hiking", "streak_days": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:연속', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:요일 → hiking:Q4 (발길의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '발길의 증명', '주말의 산을 잊지 않은 발길을 보여 주세요', '3개월 연속, 한 달에 4번 산행하고 그중 주말에 2번 이상 산행하기', 'engine_condition', '{"activity_type": "hiking", "monthly_streak": 3, "monthly_streak_min_count": 4, "streak_subset": {"day_of_week": ["saturday", "sunday"], "min_count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:요일', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:D1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:D1"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:이정표 → hiking:Q1 (쌓인 고도의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '쌓인 고도의 증명', '한 걸음씩 쌓아 올린 높이를 증명하세요', '2개월 안에 상승고도 5,000m 산행하기', 'engine_condition', '{"activity_type": "hiking", "elevation_gain_m": 5000}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:이정표', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:주기 → hiking:Q4 (발길의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '발길의 증명', '주말의 산을 잊지 않은 발길을 보여 주세요', '3개월 연속, 한 달에 4번 산행하고 그중 주말에 2번 이상 산행하기', 'engine_condition', '{"activity_type": "hiking", "monthly_streak": 3, "monthly_streak_min_count": 4, "streak_subset": {"day_of_week": ["saturday", "sunday"], "min_count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:주기', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:C1", "hiking:C3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:C1", "hiking:C3"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:최고 도달 → hiking:Q2 (높이의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '높이의 증명', '발밑이 아득해지는 높이까지 한 번에 올라 보세요', '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 산행하기', 'engine_condition', '{"activity_type": "hiking", "single_elevation_m": 1000, "max_elevation_m": 1200, "same_activity": true}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:최고 도달', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:A1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:A1"], "min_rarity": "mystic"}}'::jsonb
);

-- hiking:휴식 → hiking:Q7 (하산 뒤의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '하산 뒤의 증명', '산에서 내려온 다음 날, 몸을 내려놓는 하루까지 보여 주세요', '3개월 안에 한 번에 5시간 이상 산행하고 다음 날 휴식이 있었던 경우 2번', 'engine_condition', '{"activity_type": "hiking", "duration_minutes": 300, "rest_after_long": 1, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q7'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'hiking:휴식', 'epic_to_mystic', '{"require_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "mystic"}}'::jsonb
);

-- running:강도 → running:Q2 (페이스의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '페이스의 증명', '4주 동안 달린 당신의 속도를 증명하세요', '4주 안에 10km 이상을 5:30/km보다 빠르게, 3번 달리기', 'engine_condition', '{"activity_type": "running", "single_distance_km": 10, "max_pace_sec_per_km": 330, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:강도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:P1"], "min_rarity": "mystic"}}'::jsonb
);

-- running:누적 → running:Q1 (쌓인 거리의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '쌓인 거리의 증명', '차곡차곡 쌓은 거리로 꾸준함을 증명하세요', '2주 안에 80km 달리기', 'engine_condition', '{"activity_type": "running", "distance_km": 80}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:누적', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:K1", "running:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["running:K1", "running:K3"], "min_level": 6}}'::jsonb
);

-- running:단일 최대 → running:Q3 (먼 하루의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '먼 하루의 증명', '하루를 통째로 내어 먼 길을 끝까지 달려 보세요', '4주 안에 한 번에 25km 이상, 2번 달리기', 'engine_condition', '{"activity_type": "running", "single_distance_km": 25, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q3'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:단일 최대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:L1"], "min_rarity": "mystic"}}'::jsonb
);

-- running:달력 → running:Q8 (사계의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '사계의 증명', '달력이 넘어가도 식지 않은 발걸음을 증명하세요', '서로 다른 두 달에 각각 120km 달리기', 'engine_condition', '{"activity_type": "running", "distinct_months_required": 2, "distinct_months_metric": "distance_km", "distinct_months_threshold": 120}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q8'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:달력', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "mystic"}}'::jsonb
);

-- running:시간대 → running:Q5 (시간표의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '시간표의 증명', '이른 새벽과 깊은 밤, 시간을 가리지 않고 달려 보세요', '2주 안에 새벽(5~8시)과 밤(오후 8시~새벽 5시)에 각각 2번, 서로 다른 5개 요일에 달리기', 'engine_condition', '{"activity_type": "running", "distinct_weekday_count": 5, "time_band_counts": [{"start": "05:00", "end": "08:00", "count": 2}, {"start": "20:00", "end": "05:00", "count": 2}]}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:시간대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:T1", "running:T2", "running:T3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:T1", "running:T2", "running:T3"], "min_rarity": "mystic"}}'::jsonb
);

-- running:연속 → running:Q6 (연이은 날의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '연이은 날의 증명', '하루도 거르지 않고 달려 낸 나날을 증명하세요', '7일 연속 달리기', 'engine_condition', '{"activity_type": "running", "streak_days": 7}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:연속', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "mystic"}}'::jsonb
);

-- running:요일 → running:Q5 (시간표의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '시간표의 증명', '이른 새벽과 깊은 밤, 시간을 가리지 않고 달려 보세요', '2주 안에 새벽(5~8시)과 밤(오후 8시~새벽 5시)에 각각 2번, 서로 다른 5개 요일에 달리기', 'engine_condition', '{"activity_type": "running", "distinct_weekday_count": 5, "time_band_counts": [{"start": "05:00", "end": "08:00", "count": 2}, {"start": "20:00", "end": "05:00", "count": 2}]}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:요일', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:D1", "running:D2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:D1", "running:D2"], "min_rarity": "mystic"}}'::jsonb
);

-- running:이정표 → running:Q1 (쌓인 거리의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '쌓인 거리의 증명', '차곡차곡 쌓은 거리로 꾸준함을 증명하세요', '2주 안에 80km 달리기', 'engine_condition', '{"activity_type": "running", "distance_km": 80}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:이정표', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "mystic"}}'::jsonb
);

-- running:주기 → running:Q4 (반복의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '반복의 증명', '한 번의 열정이 아니라 되풀이되는 리듬을 증명하세요', '3주 연속, 한 주에 4번 달리기', 'engine_condition', '{"activity_type": "running", "weekly_streak": 3, "weekly_streak_min_count": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:주기', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "mystic"}}'::jsonb
);

-- running:휴식 → running:Q7 (쉼표의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '쉼표의 증명', '주마다 흐트러짐 없이 달린 박자를 증명하세요', '4주 연속, 한 주에 4번 달리기', 'engine_condition', '{"activity_type": "running", "weekly_streak": 4, "weekly_streak_min_count": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q7'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'running:휴식', 'epic_to_mystic', '{"require_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:간격 → trail_running:Q6 (이어 달린 산길의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이어 달린 산길의 증명', '산길을 향한 발걸음이 흐름을 놓치지 않았음을 보여 주세요', '4주 동안 매주 1번 이상 달리고, 3일 연속 달리는 날을 한 번 만들기', 'engine_condition', '{"activity_type": "trail_running", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:간격', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:G1"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:강도 → trail_running:Q2 (오르막의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '오르막의 증명', '길고 가파른 오르막을 거듭 넘어 보세요', '8주 안에 한 번에 25km 이상, 상승고도 800m 이상을 2번 달리기', 'engine_condition', '{"activity_type": "trail_running", "single_distance_km": 25, "single_elevation_m": 800, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:강도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:고도 → trail_running:Q4 (수직의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '수직의 증명', '한 번의 달리기로 하늘 가까이 닿아 보세요', '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 달리기', 'engine_condition', '{"activity_type": "trail_running", "single_elevation_m": 1500, "max_elevation_m": 1200, "same_activity": true}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:고도', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:E1"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:누적 → trail_running:Q1 (오르내린 거리의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '오르내린 거리의 증명', '오르고 내리며 채운 거리와 높이를 증명하세요', '2주 안에 80km, 상승고도 1,600m 달리기', 'engine_condition', '{"activity_type": "trail_running", "distance_km": 80, "elevation_gain_m": 1600}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:누적', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 6}}'::jsonb
);

-- trail_running:단일 최대 → trail_running:Q3 (울트라의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '울트라의 증명', '마라톤의 거리를 산길 위에서 한 번에 넘어 보세요', '한 번에 42km 이상 달리기', 'engine_condition', '{"activity_type": "trail_running", "single_distance_km": 42}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q3'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:단일 최대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:달력 → trail_running:Q8 (사철 산길의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '사철 산길의 증명', '달이 달라져도 산길을 꾸준히 달려 보세요', '서로 다른 두 달에 각각 120km 달리기', 'engine_condition', '{"activity_type": "trail_running", "distinct_months_required": 2, "distinct_months_metric": "distance_km", "distinct_months_threshold": 120}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q8'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:달력', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:시간대 → trail_running:Q5 (해뜨기 전의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '해뜨기 전의 증명', '이른 새벽 산길에서 하루를 열어 보세요', '3주 연속, 한 주에 3번 달리고 매주 새벽 5시~아침 8시에 1번 이상 달리기', 'engine_condition', '{"activity_type": "trail_running", "weekly_streak": 3, "weekly_streak_min_count": 3, "streak_subset": {"time_range": {"start": "05:00", "end": "08:00"}, "min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:시간대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:T1", "trail_running:T2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:T1", "trail_running:T2"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:연속 → trail_running:Q6 (이어 달린 산길의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이어 달린 산길의 증명', '산길을 향한 발걸음이 흐름을 놓치지 않았음을 보여 주세요', '4주 동안 매주 1번 이상 달리고, 3일 연속 달리는 날을 한 번 만들기', 'engine_condition', '{"activity_type": "trail_running", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:연속', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:N1", "trail_running:N2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:N1", "trail_running:N2"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:이정표 → trail_running:Q1 (오르내린 거리의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '오르내린 거리의 증명', '오르고 내리며 채운 거리와 높이를 증명하세요', '2주 안에 80km, 상승고도 1,600m 달리기', 'engine_condition', '{"activity_type": "trail_running", "distance_km": 80, "elevation_gain_m": 1600}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:이정표', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:주기 → trail_running:Q5 (해뜨기 전의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '해뜨기 전의 증명', '이른 새벽 산길에서 하루를 열어 보세요', '3주 연속, 한 주에 3번 달리고 매주 새벽 5시~아침 8시에 1번 이상 달리기', 'engine_condition', '{"activity_type": "trail_running", "weekly_streak": 3, "weekly_streak_min_count": 3, "streak_subset": {"time_range": {"start": "05:00", "end": "08:00"}, "min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:주기', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:최고 도달 → trail_running:Q4 (수직의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '수직의 증명', '한 번의 달리기로 하늘 가까이 닿아 보세요', '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 달리기', 'engine_condition', '{"activity_type": "trail_running", "single_elevation_m": 1500, "max_elevation_m": 1200, "same_activity": true}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:최고 도달', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:A1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:A1"], "min_rarity": "mystic"}}'::jsonb
);

-- trail_running:휴식 → trail_running:Q7 (내리막 뒤의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '내리막 뒤의 증명', '내리막이 끝난 다음 날, 발을 멈추는 하루까지 증명하세요', '8주 안에 한 번에 25km 이상 달리고 다음 날 휴식이 있었던 경우 2번', 'engine_condition', '{"activity_type": "trail_running", "single_distance_km": 25, "rest_after_long": 1, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q7'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'trail_running:휴식', 'epic_to_mystic', '{"require_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:누적 → walking:M1 (누적의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '누적의 증명', '걸음이 모여 만든 거리를 증명하세요', '2주 안에 20km 걷기', 'engine_condition', '{"activity_type": "walking", "distance_km": 20}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M1'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:누적', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}}'::jsonb
);

-- walking:달력 → walking:M8 (계절의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '계절의 증명', '한 달로 끝나지 않는 한결같은 걸음을 보여 주세요', '서로 다른 두 달에 각각 30km 걷기', 'engine_condition', '{"activity_type": "walking", "distinct_months_required": 2, "distinct_months_metric": "distance_km", "distinct_months_threshold": 30}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M8'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:달력', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:시간대 → walking:M3 (시간의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '시간의 증명', '새벽에도, 낮에도, 밤에도 걷는 사람임을 증명하세요', '2주 안에 새벽(5~8시)·낮(오전 8시~오후 10시)·밤(오후 10시~새벽 5시)에 각각 2번 걷기', 'engine_condition', '{"activity_type": "walking", "time_band_counts": [{"start": "05:00", "end": "08:00", "count": 2}, {"start": "08:00", "end": "22:00", "count": 2}, {"start": "22:00", "end": "05:00", "count": 2}]}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M3'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:시간대', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:연속 → walking:M5 (연속의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '연속의 증명', '걷지 않은 날이 하루도 없음을 증명하세요', '7일 연속 걷기', 'engine_condition', '{"activity_type": "walking", "streak_days": 7}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M5'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:연속', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:요일 → walking:M4 (요일의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '요일의 증명', '요일에 얽매이지 않는 걸음을 남겨 보세요', '2주 안에 서로 다른 5개 요일에 걷기', 'engine_condition', '{"activity_type": "walking", "distinct_weekday_count": 5}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M4'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:요일', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:이정표 → walking:M6 (이정표의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '이정표의 증명', '이정표를 세우듯 성큼 멀리 걸어 보세요', '한 번에 8km 이상 걷기', 'engine_condition', '{"activity_type": "walking", "single_distance_km": 8}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M6'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:이정표', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:주기 → walking:M2 (리듬의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '리듬의 증명', '매주 같은 리듬으로 걷는 습관을 증명하세요', '3주 연속, 한 주에 3번 걷기', 'engine_condition', '{"activity_type": "walking", "weekly_streak": 3, "weekly_streak_min_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M2'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:주기', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "mystic"}}'::jsonb
);

-- walking:휴식 → walking:M7 (회복의 증명)
INSERT INTO public.missions (
  title, description, condition_text, mission_type, condition_json, reward_badge_ids,
  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json
) VALUES (
  '회복의 증명', '한 주도 놓치지 않고 걸음을 지켜 낸 시간을 증명하세요', '4주 연속, 한 주에 3번 걷기', 'engine_condition', '{"activity_type": "walking", "weekly_streak": 4, "weekly_streak_min_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M7'
         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE
         AND deleted_at IS NULL)]::uuid[],
  'individual', now(), NULL,
  'walking:휴식', 'epic_to_mystic', '{"require_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "mystic"}}'::jsonb
);

COMMIT;

-- 🧪 적용 후 검증
--   SELECT count(*) FROM public.missions WHERE mission_type = 'engine_condition';
--     → 53 (축 기준 행 수 — 코드 하나가 여러 축을 여는 경우 같은 보상 배지를 
--       가리키는 행이 여러 개다. 정상)
--   SELECT count(*) FROM public.missions WHERE mission_type = 'engine_condition'
--     AND (reward_badge_ids IS NULL OR reward_badge_ids = '{}' OR reward_badge_ids[1] IS NULL);
--     → 0 (보상 배지 서브쿼리가 전부 매치돼야 한다 — 1행이라도 있으면 family_key 불일치)
--   SELECT gate_axis, gate_stage, count(*) FROM public.missions
--     WHERE mission_type = 'engine_condition' GROUP BY 1, 2 HAVING count(*) > 1;
--     → 0행 (축·단계 중복 없음 — /admin/gate-missions 정합성 검사와 같은 기준)
