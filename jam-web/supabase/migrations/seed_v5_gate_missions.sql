-- seed_v5_gate_missions.sql — 게이트 미션 40종 INSERT (걷기 8 + 4종목 32)
--      (티켓 20260906_2231, 마스터 20260905_0026 후속 · 20260906_1947 ② 이관)
--
-- 배경:
--   badges에는 mission_reward=true 보상 배지 40종이 이미 시딩돼 있지만(티켓 20260905_0035),
--   그 배지를 지급할 미션 자체가 missions 테이블에 한 행도 없었다 — Epic→Mystic 관문
--   (미션 보상 배지 요구)이 열리지 않는 원인이었다. 이 파일이 그 미션 40종을 만든다.
--
--   조건 어휘는 이 티켓이 badge-engine에 새로 추가한 4종(period_streak·
--   time_bands_requirement·distinct_days_of_week_count·distinct_months_threshold,
--   마이그레이션 142)과 기존 어휘(repeat_count·rest_after_long·single_distance_km·
--   max_pace_sec_per_km 등)를 그대로 조합했다 — 근사(뭉개기) 없이 v5_mission_badges.json·
--   v5_mission_axis_groups.json의 미션 달성조건을 정확히 옮겼다. 「N주/개월 안에」류
--   기간 창(deadline)만 예외적으로 뺐다 — 이 미션들은 개인형(individual, 유저마다 Epic
--   도달 시점이 다른 상시 미션)이라 전역 ends_at으로 「참가 시점부터 N주」를 표현할 수
--   없고(엔진에 참가 시점 기준 상대 마감 개념이 아예 없다), 이미 확정 반영된 걷기 M1
--   (「2주 안에 20km」 → distance_km:20, 마감 없음)과 같은 전례를 그대로 따랐다.
--
--   축→미션코드 매핑표는 Specs/Content/v5_gate_build.py의 MISSION_MAP을 그대로 썼다
--   (1947이 만듦, 다시 만들지 않았다). gate_axis는 그 매핑이 하나의 미션에 묶은 축들을
--   " · "로 이어 붙인 복합 라벨이다(예: "running:누적 · 이정표") — missions.gate_axis가
--   단일 문자열 컬럼이라 그렇다. visibility_rule_json.require_owned/hide_when_owned의
--   family_keys는 실제 배포된 seed_v5_gate_conditions.sql(1947, 이미 실행됨)의
--   gate_mission_badge 참조에서 그대로 역추출했다 — Epic·Mystic이 같은 family_key를
--   공유하므로 같은 목록을 min_rarity만 바꿔 양쪽에 쓴다.
--
-- ⚠️ 5건은 예외다 — 아래 목록은 gate_mission_badge로 아직 이 미션을 가리키는 Mystic이
--   없다(콘텐츠 격차, 코드 결함 아님):
--   · walking:M1(누적) — 무한레벨형(rarity 없음) 계열이라 「Epic 보유」 개념 자체가 없다.
--     마스터 티켓의 "누적 축 자체의 Lv.5+/Lv.8+ 게이트는 범위 밖" 결정을 그대로 따라
--     visibility_rule_json을 NULL로 둔다(노출 제한 없음 — 마이그레이션 135가 이미 검증한
--     동작). 레벨형 게이트 표현 수단이 생기면 후속 티켓에서 채운다.
--   · cycling:Q7·hiking:Q7·trail_running:Q7(휴식) · trail_running:Q8(달력) — 이 축의
--     Mystic이 Epic까지만 시딩돼 있다(1947 완료기록의 "콘텐츠 팀 확인 필요" 3건 + 트레일
--     달력 W1/W2). require_owned는 그 축의 실제 Epic 계열로 정확히 채웠지만,
--     hide_when_owned은 뺐다(가리킬 Mystic이 없다) — Mystic이 나중에 추가되면 그때
--     채운다. 지금은 완료 기록(user_mission_completions)이 완료 후 노출을 대신 처리한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 마이그레이션 142(조건 어휘 4종 CHECK 확장)와 함께, 또는 그 이후 실행한다.
--   badges 40종(mission_reward=true, family_key = 걷기:M1~M8 · {종목}:Q1~Q8)이 먼저
--   시딩돼 있어야 한다(이미 배포됨, 티켓 20260905_0035) — reward_badge_ids를 그 family_key로
--   조회하는 서브쿼리가 있다.
--
-- 재실행 가능(idempotent): 각 INSERT가 WHERE NOT EXISTS(같은 gate_axis+gate_stage)로
--   막혀 있다.

BEGIN;

-- walking:M1 — 여는 축: 누적
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '누적의 증명',
  '20km를 걸어보세요.',
  'distance',
  '{"distance_km": 20, "activity_type": "walking"}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:누적',
  'epic_to_mystic',
  NULL,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:누적' AND gate_stage = 'epic_to_mystic');

-- walking:M2 — 여는 축: 주기
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '리듬의 증명',
  '3주(월~일) 연속으로 한 주에 3회 이상 걸어보세요.',
  'engine_condition',
  '{"activity_type": "walking", "period_streak": {"unit": "week", "length": 3, "min_count": 3}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:주기',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:주기' AND gate_stage = 'epic_to_mystic');

-- walking:M3 — 여는 축: 시간대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '시간의 증명',
  '새벽·낮·밤 시간대에 각각 2회 이상 걸어보세요.',
  'engine_condition',
  '{"activity_type": "walking", "time_bands_requirement": {"bands": [{"start": "05:00", "end": "08:00"}, {"start": "12:00", "end": "14:00"}, {"start": "22:00", "end": "05:00"}], "min_count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:시간대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:시간대' AND gate_stage = 'epic_to_mystic');

-- walking:M4 — 여는 축: 요일
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '요일의 증명',
  '서로 다른 5개 요일에 걸어보세요.',
  'engine_condition',
  '{"activity_type": "walking", "distinct_days_of_week_count": 5}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:요일',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:요일' AND gate_stage = 'epic_to_mystic');

-- walking:M5 — 여는 축: 연속
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '연속의 증명',
  '7일 연속으로 걸어보세요.',
  'streak_days',
  '{"activity_type": "walking", "streak_days": 7}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:연속',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:S1", "walking:S2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:S1", "walking:S2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:연속' AND gate_stage = 'epic_to_mystic');

-- walking:M6 — 여는 축: 이정표
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '이정표의 증명',
  '한 번에 8km 이상 걸어보세요.',
  'engine_condition',
  '{"activity_type": "walking", "single_distance_km": 8}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:이정표',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:C3", "walking:C5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:C3", "walking:C5"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:이정표' AND gate_stage = 'epic_to_mystic');

-- walking:M7 — 여는 축: 휴식
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '회복의 증명',
  '4주(월~일) 연속으로 한 주에 3회 이상 걸으면서 쉬는 날도 챙겨보세요.',
  'engine_condition',
  '{"activity_type": "walking", "period_streak": {"unit": "week", "length": 4, "min_count": 3}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M7' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:휴식',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:휴식' AND gate_stage = 'epic_to_mystic');

-- walking:M8 — 여는 축: 달력
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '계절의 증명',
  '서로 다른 두 달에 각각 30km씩 걸어보세요.',
  'engine_condition',
  '{"activity_type": "walking", "distinct_months_threshold": {"metric": "distance_km", "value": 30, "count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'walking:M8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'walking:달력',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["walking:W1", "walking:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:W1", "walking:W2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'walking:달력' AND gate_stage = 'epic_to_mystic');

-- running:Q1 — 여는 축: 누적 · 이정표
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '쌓인 거리의 증명',
  '80km를 달려보세요.',
  'distance',
  '{"distance_km": 80, "activity_type": "running"}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:누적 · 이정표',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:M3", "running:M5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:M3", "running:M5"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:누적 · 이정표' AND gate_stage = 'epic_to_mystic');

-- running:Q2 — 여는 축: 강도
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '페이스의 증명',
  '한 번에 10km 이상, 5:30/km보다 빠르게 3회 달려보세요.',
  'engine_condition',
  '{"activity_type": "running", "single_distance_km": 10, "max_pace_sec_per_km": 330, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:강도',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:P1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:강도' AND gate_stage = 'epic_to_mystic');

-- running:Q3 — 여는 축: 단일 최대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '먼 하루의 증명',
  '한 번에 25km 이상을 2회 달려보세요.',
  'engine_condition',
  '{"activity_type": "running", "single_distance_km": 25, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:단일 최대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:L1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:단일 최대' AND gate_stage = 'epic_to_mystic');

-- running:Q4 — 여는 축: 주기
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '반복의 증명',
  '3주(월~일) 연속으로 한 주에 4회 이상 달려보세요.',
  'engine_condition',
  '{"activity_type": "running", "period_streak": {"unit": "week", "length": 3, "min_count": 4}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:주기',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:주기' AND gate_stage = 'epic_to_mystic');

-- running:Q5 — 여는 축: 시간대 · 요일
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '시간표의 증명',
  '새벽·밤에 각각 2회 이상, 서로 다른 5개 요일에 달려보세요.',
  'engine_condition',
  '{"activity_type": "running", "time_bands_requirement": {"bands": [{"start": "05:00", "end": "08:00"}, {"start": "20:00", "end": "05:00"}], "min_count": 2}, "distinct_days_of_week_count": 5}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:시간대 · 요일',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:시간대 · 요일' AND gate_stage = 'epic_to_mystic');

-- running:Q6 — 여는 축: 연속
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '연이은 날의 증명',
  '7일 연속으로 달려보세요.',
  'streak_days',
  '{"activity_type": "running", "streak_days": 7}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:연속',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:N1", "running:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:N1", "running:N3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:연속' AND gate_stage = 'epic_to_mystic');

-- running:Q7 — 여는 축: 휴식
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '쉼표의 증명',
  '4주(월~일) 연속으로 한 주에 4회 이상 달리면서 쉬는 날도 챙겨보세요.',
  'engine_condition',
  '{"activity_type": "running", "period_streak": {"unit": "week", "length": 4, "min_count": 4}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q7' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:휴식',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:X1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:X1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:휴식' AND gate_stage = 'epic_to_mystic');

-- running:Q8 — 여는 축: 달력
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '사계의 증명',
  '서로 다른 두 달에 각각 120km씩 달려보세요.',
  'engine_condition',
  '{"activity_type": "running", "distinct_months_threshold": {"metric": "distance_km", "value": 120, "count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'running:Q8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'running:달력',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["running:W1", "running:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:W1", "running:W2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'running:달력' AND gate_stage = 'epic_to_mystic');

-- cycling:Q1 — 여는 축: 누적 · 이정표
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '바퀴 자국의 증명',
  '330km를 라이딩해보세요.',
  'distance',
  '{"distance_km": 330, "activity_type": "cycling"}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:누적 · 이정표',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:M3", "cycling:M5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:M3", "cycling:M5"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:누적 · 이정표' AND gate_stage = 'epic_to_mystic');

-- cycling:Q2 — 여는 축: 강도 · 최고 도달
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '속도의 증명',
  '한 번에 30km 이상, 평균 속도 25km/h 이상으로 3회 라이딩해보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "single_distance_km": 30, "min_speed_kmh": 25, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:강도 · 최고 도달',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:강도 · 최고 도달' AND gate_stage = 'epic_to_mystic');

-- cycling:Q3 — 여는 축: 단일 최대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '지평선의 증명',
  '한 번에 130km 이상을 2회 라이딩해보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "single_distance_km": 130, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:단일 최대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:L1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:단일 최대' AND gate_stage = 'epic_to_mystic');

-- cycling:Q4 — 여는 축: 고도
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '언덕의 증명',
  '한 번에 상승고도 1,200m 이상을 2회 달성해보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "single_elevation_m": 1200, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:고도',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:E1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:고도' AND gate_stage = 'epic_to_mystic');

-- cycling:Q5 — 여는 축: 주기 · 요일
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '주말의 증명',
  '3주(월~일) 연속으로 한 주에 3회 이상, 매주 주말에 1회 이상 라이딩해보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "period_streak": {"unit": "week", "length": 3, "min_count": 3, "subset_day_of_week": ["saturday", "sunday"], "subset_min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:주기 · 요일',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:주기 · 요일' AND gate_stage = 'epic_to_mystic');

-- cycling:Q6 — 여는 축: 연속 · 간격
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '이어진 바퀴의 증명',
  '4주(월~일) 동안 3일 연속 라이딩 1회를 포함해 매주 1회 이상 타보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:연속 · 간격',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:연속 · 간격' AND gate_stage = 'epic_to_mystic');

-- cycling:Q7 — 여는 축: 휴식
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '빈 안장의 증명',
  '한 번에 100km 이상 라이딩한 다음 날 쉬는 패턴을 3회 만들어보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "single_distance_km": 100, "rest_after_long": 1, "repeat_count": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q7' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:휴식',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "epic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:휴식' AND gate_stage = 'epic_to_mystic');

-- cycling:Q8 — 여는 축: 달력
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '추위와 더위의 증명',
  '서로 다른 두 달에 각각 500km씩 라이딩해보세요.',
  'engine_condition',
  '{"activity_type": "cycling", "distinct_months_threshold": {"metric": "distance_km", "value": 500, "count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'cycling:Q8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'cycling:달력',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["cycling:W1", "cycling:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:W1", "cycling:W2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'cycling:달력' AND gate_stage = 'epic_to_mystic');

-- hiking:Q1 — 여는 축: 누적 · 이정표
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '쌓인 고도의 증명',
  '상승고도 5,000m를 쌓아보세요.',
  'elevation_gain_m',
  '{"activity_type": "hiking", "elevation_gain_m": 5000}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:누적 · 이정표',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:M3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:M3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:누적 · 이정표' AND gate_stage = 'epic_to_mystic');

-- hiking:Q2 — 여는 축: 강도 · 최고 도달
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '높이의 증명',
  '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상을 함께 달성해보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "single_elevation_m": 1000, "max_elevation_m": 1200, "repeat_count": 1}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:강도 · 최고 도달',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:강도 · 최고 도달' AND gate_stage = 'epic_to_mystic');

-- hiking:Q3 — 여는 축: 단일 최대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '긴 산행의 증명',
  '한 번에 6시간 이상 산행을 2회 해보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "duration_minutes": 360, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:단일 최대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:단일 최대' AND gate_stage = 'epic_to_mystic');

-- hiking:Q4 — 여는 축: 주기 · 요일
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '발길의 증명',
  '3개월 연속으로 한 달에 4회 이상, 매달 주말에 2회 이상 산에 올라보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "period_streak": {"unit": "month", "length": 3, "min_count": 4, "subset_day_of_week": ["saturday", "sunday"], "subset_min_count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:주기 · 요일',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:주기 · 요일' AND gate_stage = 'epic_to_mystic');

-- hiking:Q5 — 여는 축: 연속
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '이어진 능선의 증명',
  '3일 연속으로 산에 올라보세요.',
  'streak_days',
  '{"activity_type": "hiking", "streak_days": 3}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:연속',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:N1", "hiking:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:N1", "hiking:N3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:연속' AND gate_stage = 'epic_to_mystic');

-- hiking:Q6 — 여는 축: 간격
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '돌아오는 산의 증명',
  '6개월 연속으로 한 달에 2회 이상 산에 올라보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "period_streak": {"unit": "month", "length": 6, "min_count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:간격',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:G1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:간격' AND gate_stage = 'epic_to_mystic');

-- hiking:Q7 — 여는 축: 휴식
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '하산 뒤의 증명',
  '한 번에 5시간 이상 산행한 다음 날 쉬는 패턴을 2회 만들어보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "duration_minutes": 300, "rest_after_long": 1, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q7' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:휴식',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "epic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:휴식' AND gate_stage = 'epic_to_mystic');

-- hiking:Q8 — 여는 축: 달력
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '눈과 볕의 증명',
  '서로 다른 두 달에 각각 상승고도 1,800m씩 쌓아보세요.',
  'engine_condition',
  '{"activity_type": "hiking", "distinct_months_threshold": {"metric": "elevation_gain_m", "value": 1800, "count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'hiking:Q8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'hiking:달력',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["hiking:W1", "hiking:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:W1", "hiking:W2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'hiking:달력' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q1 — 여는 축: 누적 · 이정표
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '오르내린 거리의 증명',
  '80km를 달리면서 상승고도 1,600m를 함께 쌓아보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "distance_km": 80, "elevation_gain_m": 1600}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:누적 · 이정표',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:M3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:M3"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:누적 · 이정표' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q2 — 여는 축: 강도
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '오르막의 증명',
  '한 번에 25km 이상, 상승고도 800m 이상을 2회 달성해보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "single_distance_km": 25, "single_elevation_m": 800, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:강도',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:강도' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q3 — 여는 축: 단일 최대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '울트라의 증명',
  '한 번에 42km 이상을 달려보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "single_distance_km": 42, "repeat_count": 1}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:단일 최대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:단일 최대' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q4 — 여는 축: 고도 · 최고 도달
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '수직의 증명',
  '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상을 함께 달성해보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "single_elevation_m": 1500, "max_elevation_m": 1200, "repeat_count": 1}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:고도 · 최고 도달',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:고도 · 최고 도달' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q5 — 여는 축: 주기 · 시간대
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '해뜨기 전의 증명',
  '3주(월~일) 연속으로 한 주에 3회 이상, 매주 새벽에 1회 이상 달려보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "period_streak": {"unit": "week", "length": 3, "min_count": 3, "subset_time_range": {"start": "05:00", "end": "08:00"}, "subset_min_count": 1}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:주기 · 시간대',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:주기 · 시간대' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q6 — 여는 축: 연속 · 간격
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '이어 달린 산길의 증명',
  '4주(월~일) 동안 3일 연속 달리기 1회를 포함해 매주 1회 이상 달려보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "streak_days": 3, "weekly_streak": 4}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:연속 · 간격',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:G1", "trail_running:N1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:G1", "trail_running:N1"], "min_rarity": "mystic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:연속 · 간격' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q7 — 여는 축: 휴식
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '내리막 뒤의 증명',
  '한 번에 25km 이상 달린 다음 날 쉬는 패턴을 2회 만들어보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "single_distance_km": 25, "rest_after_long": 1, "repeat_count": 2}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q7' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:휴식',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "epic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:휴식' AND gate_stage = 'epic_to_mystic');

-- trail_running:Q8 — 여는 축: 달력
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT
  '사철 산길의 증명',
  '서로 다른 두 달에 각각 120km씩 달려보세요.',
  'engine_condition',
  '{"activity_type": "trail_running", "distinct_months_threshold": {"metric": "distance_km", "value": 120, "count": 2}}'::jsonb,
  ARRAY[(SELECT id FROM public.badges WHERE family_key = 'trail_running:Q8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL)]::uuid[],
  NULL,
  'individual',
  NULL,
  NULL,
  'trail_running:달력',
  'epic_to_mystic',
  '{"require_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "epic"}}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE gate_axis = 'trail_running:달력' AND gate_stage = 'epic_to_mystic');

COMMIT;
