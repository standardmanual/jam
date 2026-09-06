-- 143: 2단 교차 게이트 — 게이트 미션 40건(걷기 8 + 4종목 32) 시딩/전환
--      (티켓 20260906_1947 ②, 마스터 20260905_0026 §게이트, 마이그레이션 135 대상)
--
-- 배경:
--   실측(이 티켓 착수 전): missions.total=30, axis_based=0, legacy_gate=0 — 게이트 배지를
--   여는 미션이 한 건도 없었다. `mission_reward` 조건 배지 40종(종목당 8, 티켓 0035 B묶음)은
--   이미 시딩돼 있으나 연결이 없었다.
--
-- 방식 — UPDATE 우선, 없으면 INSERT (WITH 데이터 수정 CTE, idempotent):
--   기존 30건 중 제목이 일치하고 아직 `gate_axis IS NULL`인 미션이 있으면 그 행을
--   게이트 미션으로 전환(UPDATE)한다. 없으면 신규로 만든다(INSERT) — 2026-09-06
--   사용자가 "필요한 미션 생성을 모두 실행하라"고 명시적으로 승인했다. 이미 게이트 미션으로
--   전환/생성된 제목은 두 번째 실행에서 건드리지 않는다(재실행 안전).
--
-- gate_axis · visibility_rule_json 산출 (기계적):
--   `Service Plan/Specs/Content/v5_gate_mapping_sql_build.py`가 `v5_gate_mapping.json`의
--   `gate_mission_badge` 역참조로 "이 배지가 여는 축"을 모아, `gate_axis`(대표 축 하나 —
--   admin 매트릭스 분류용)와 `visibility_rule_json`(연 축 전체의 합집합 — 실제 노출 판정은
--   이 필드가 정본이라 축이 여럿이어도 놓치지 않는다)을 만든다. `gate_stage`는 전부
--   'epic_to_mystic'이다(이 40건은 전부 Mystic을 여는 열쇠, Rare→Epic을 여는 미션은 없다 —
--   마스터 티켓 §게이트 표가 애초에 Rare→Epic에 미션을 요구하지 않는다. 이 실측 때문에
--   `checkGateMissionConsistency`의 axis_stage_gap 검사도 rare_to_epic을 더는 구멍으로
--   잡지 않도록 함께 고쳤다 — `src/lib/missions/gateMissions.ts`).
--
--   ⚠️ **레벨형(누적) 축과 등급형 축을 동시에 여는 미션 4건**(러닝·자전거·등산·트레일의
--   "누적+이정표" 미션)은 `require_owned`/`hide_when_owned`에 `min_rarity`도 `min_level`도
--   걸지 않는다 — `BadgeGateRequirement`는 `family_keys` 전체에 등급 하한 하나만 걸 수 있어
--   레벨형·등급형이 섞이면 어느 쪽으로 걸어도 다른 쪽이 "영원히 미충족"이 된다(실측으로
--   확인 — `checkGateMissionConsistency`의 `level_requirement_on_graded_family`가 처음엔
--   36건을 잡아냈다). 하한 없이 "이 계열 중 하나라도 보유"로 완화했다 — 노출 판정만
--   느슨해질 뿐, 실제 발급 게이트(각 배지의 `cross_between_axis`/`min_level`)는 그대로 지킨다.
--
-- ⚠️ mission_type/condition_json(미션 «달성» 조건)은 기계적으로 뽑을 수 없어 이 스크립트가
--    직접 명시한 표를 썼다 — `MissionCondition`(단일 필드 + activity_type)과 어드민 게이트
--    미션 폼(GateMissionManager.tsx)이 지금 "필드 하나 + activity_type" 조건만 지원하기
--    때문이다(신규 제약 아님, 기존 폼도 같다). "한 번에 X 이상/N회"·페이스·시간대·
--    "다음 날 휴식"·"서로 다른 두 달" 같은 복합 조건을 표현할 mission_type이 없어
--    **32건 중 다수를 "가장 근접한 단일 누적값"으로 근사했다** — 상세 손실 내역은
--    구현 요약의 alerts([WARN] 목록)에 전부 남겼다. 게이트 배선(축→미션→배지) 자체는
--    이 근사와 무관하게 정확하다 — 손실되는 것은 "그 미션을 얼마나 정교하게 요구하는가"뿐이다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙에 따라 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 선행 조건: 이 파일은 142(badges.condition_json의 gate_mission_badge)가 먼저 실행돼
-- 있어야 reward_badge_ids 서브쿼리가 아니라 badges 자체를 올바르게 찾는다 — 다만 badges는
-- 0035가 이미 시딩했으므로 순서가 바뀌어도(143을 142보다 먼저) 이 파일 자체는 깨지지
-- 않는다(대상 배지가 이미 존재한다). 그래도 142 → 143 순서를 권장한다.

BEGIN;

-- walking:M1 · 누적의 증명 (여는 축: walking:누적)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M1' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:누적',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "hide_when_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 8}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '누적의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '누적의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 20, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:누적', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "hide_when_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 8}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '누적의 증명');

-- walking:M2 · 리듬의 증명 (여는 축: walking:주기)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M2' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:주기',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '리듬의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '리듬의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 9, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:주기', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '리듬의 증명');

-- walking:M3 · 시간의 증명 (여는 축: walking:시간대)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M3' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:시간대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '시간의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '시간의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 6, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:시간대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '시간의 증명');

-- walking:M4 · 요일의 증명 (여는 축: walking:요일)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M4' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:요일',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '요일의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '요일의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 5, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:요일', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:D0", "walking:D1", "walking:D2", "walking:D3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '요일의 증명');

-- walking:M5 · 연속의 증명 (여는 축: walking:연속)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M5' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:연속',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '연속의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '연속의 증명', '미션으로만 얻는 열쇠입니다.', 'streak_days', '{"streak_days": 7, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:연속', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '연속의 증명');

-- walking:M6 · 이정표의 증명 (여는 축: walking:이정표)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M6' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:이정표',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '이정표의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '이정표의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 8, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:이정표', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:C1", "walking:C2", "walking:C3", "walking:C4", "walking:C5"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '이정표의 증명');

-- walking:M7 · 회복의 증명 (여는 축: walking:휴식)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M7' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:휴식',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '회복의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '회복의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 12, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:휴식', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '회복의 증명');

-- walking:M8 · 계절의 증명 (여는 축: walking:달력)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'walking:M8' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'walking:달력',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '계절의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '계절의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 60, "activity_type": "walking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'walking:달력', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '계절의 증명');

-- running:Q1 · 쌓인 거리의 증명 (여는 축: running:누적, running:이정표)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q1' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:누적',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:K1", "running:K3", "running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}, "hide_when_owned": {"family_keys": ["running:K1", "running:K3", "running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '쌓인 거리의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '쌓인 거리의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 80, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:누적', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:K1", "running:K3", "running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}, "hide_when_owned": {"family_keys": ["running:K1", "running:K3", "running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '쌓인 거리의 증명');

-- running:Q2 · 페이스의 증명 (여는 축: running:강도)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q2' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:강도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '페이스의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '페이스의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 30, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:강도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '페이스의 증명');

-- running:Q3 · 먼 하루의 증명 (여는 축: running:단일 최대)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q3' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:단일 최대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:L1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '먼 하루의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '먼 하루의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 50, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:단일 최대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:L1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '먼 하루의 증명');

-- running:Q4 · 반복의 증명 (여는 축: running:주기)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q4' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:주기',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '반복의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '반복의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 12, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:주기', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '반복의 증명');

-- running:Q5 · 시간표의 증명 (여는 축: running:시간대, running:요일)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q5' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:시간대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '시간표의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '시간표의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 5, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:시간대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:D1", "running:D2", "running:T1", "running:T2", "running:T3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '시간표의 증명');

-- running:Q6 · 연이은 날의 증명 (여는 축: running:연속)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q6' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:연속',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '연이은 날의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '연이은 날의 증명', '미션으로만 얻는 열쇠입니다.', 'streak_days', '{"streak_days": 7, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:연속', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '연이은 날의 증명');

-- running:Q7 · 쉼표의 증명 (여는 축: running:휴식)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q7' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:휴식',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '쉼표의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '쉼표의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 16, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:휴식', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '쉼표의 증명');

-- running:Q8 · 사계의 증명 (여는 축: running:달력)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'running:Q8' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'running:달력',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '사계의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '사계의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 240, "activity_type": "running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'running:달력', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '사계의 증명');

-- cycling:Q1 · 바퀴 자국의 증명 (여는 축: cycling:누적, cycling:이정표)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q1' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:누적',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3", "cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}, "hide_when_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3", "cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '바퀴 자국의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '바퀴 자국의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 330, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:누적', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3", "cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}, "hide_when_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3", "cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '바퀴 자국의 증명');

-- cycling:Q2 · 속도의 증명 (여는 축: cycling:강도, cycling:최고 도달)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q2' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:강도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '속도의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '속도의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 90, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:강도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:P1", "cycling:V1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '속도의 증명');

-- cycling:Q3 · 지평선의 증명 (여는 축: cycling:단일 최대)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q3' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:단일 최대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:L1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '지평선의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '지평선의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 260, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:단일 최대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:L1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:L1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '지평선의 증명');

-- cycling:Q4 · 언덕의 증명 (여는 축: cycling:고도)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q4' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:고도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:E1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '언덕의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '언덕의 증명', '미션으로만 얻는 열쇠입니다.', 'elevation_gain_m', '{"elevation_gain_m": 2400, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:고도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:E1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '언덕의 증명');

-- cycling:Q5 · 주말의 증명 (여는 축: cycling:요일, cycling:주기)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q5' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:요일',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '주말의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '주말의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 9, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:요일', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4", "cycling:D1", "cycling:D2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '주말의 증명');

-- cycling:Q6 · 이어진 바퀴의 증명 (여는 축: cycling:간격, cycling:연속)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q6' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:간격',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '이어진 바퀴의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '이어진 바퀴의 증명', '미션으로만 얻는 열쇠입니다.', 'streak_days', '{"streak_days": 3, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:간격', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:G1", "cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '이어진 바퀴의 증명');

-- cycling:Q7 · 빈 안장의 증명 (여는 축: cycling:휴식)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q7' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:휴식',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '빈 안장의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '빈 안장의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 300, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:휴식', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '빈 안장의 증명');

-- cycling:Q8 · 추위와 더위의 증명 (여는 축: cycling:달력)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'cycling:Q8' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'cycling:달력',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '추위와 더위의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '추위와 더위의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 1000, "activity_type": "cycling"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'cycling:달력', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '추위와 더위의 증명');

-- hiking:Q1 · 쌓인 고도의 증명 (여는 축: hiking:누적, hiking:이정표)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q1' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:누적',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:K1", "hiking:K3", "hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}, "hide_when_owned": {"family_keys": ["hiking:K1", "hiking:K3", "hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '쌓인 고도의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '쌓인 고도의 증명', '미션으로만 얻는 열쇠입니다.', 'elevation_gain_m', '{"elevation_gain_m": 5000, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:누적', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:K1", "hiking:K3", "hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}, "hide_when_owned": {"family_keys": ["hiking:K1", "hiking:K3", "hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '쌓인 고도의 증명');

-- hiking:Q2 · 높이의 증명 (여는 축: hiking:강도, hiking:최고 도달)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q2' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:강도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '높이의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '높이의 증명', '미션으로만 얻는 열쇠입니다.', 'elevation_gain_m', '{"elevation_gain_m": 1000, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:강도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:A1", "hiking:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '높이의 증명');

-- hiking:Q3 · 긴 산행의 증명 (여는 축: hiking:단일 최대)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q3' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:단일 최대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '긴 산행의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '긴 산행의 증명', '미션으로만 얻는 열쇠입니다.', 'duration_minutes', '{"duration_minutes": 360, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:단일 최대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '긴 산행의 증명');

-- hiking:Q4 · 발길의 증명 (여는 축: hiking:요일, hiking:주기)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q4' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:요일',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '발길의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '발길의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 12, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:요일', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:C1", "hiking:C3", "hiking:D1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '발길의 증명');

-- hiking:Q5 · 이어진 능선의 증명 (여는 축: hiking:연속)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q5' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:연속',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '이어진 능선의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '이어진 능선의 증명', '미션으로만 얻는 열쇠입니다.', 'streak_days', '{"streak_days": 3, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:연속', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '이어진 능선의 증명');

-- hiking:Q6 · 돌아오는 산의 증명 (여는 축: hiking:간격)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q6' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:간격',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:G1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '돌아오는 산의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '돌아오는 산의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 12, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:간격', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:G1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:G1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '돌아오는 산의 증명');

-- hiking:Q7 · 하산 뒤의 증명 (여는 축: hiking:휴식)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q7' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:휴식',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '하산 뒤의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '하산 뒤의 증명', '미션으로만 얻는 열쇠입니다.', 'duration_minutes', '{"duration_minutes": 300, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:휴식', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '하산 뒤의 증명');

-- hiking:Q8 · 눈과 볕의 증명 (여는 축: hiking:달력)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'hiking:Q8' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'hiking:달력',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '눈과 볕의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '눈과 볕의 증명', '미션으로만 얻는 열쇠입니다.', 'elevation_gain_m', '{"elevation_gain_m": 3600, "activity_type": "hiking"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'hiking:달력', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '눈과 볕의 증명');

-- trail_running:Q1 · 오르내린 거리의 증명 (여는 축: trail_running:누적, trail_running:이정표)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q1' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:누적',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3", "trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"]}, "hide_when_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3", "trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"]}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '오르내린 거리의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '오르내린 거리의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 80, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:누적', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3", "trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"]}, "hide_when_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3", "trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"]}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '오르내린 거리의 증명');

-- trail_running:Q2 · 오르막의 증명 (여는 축: trail_running:강도)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q2' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:강도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '오르막의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '오르막의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 50, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:강도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:P1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '오르막의 증명');

-- trail_running:Q3 · 울트라의 증명 (여는 축: trail_running:단일 최대)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q3' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:단일 최대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '울트라의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '울트라의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 42, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:단일 최대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '울트라의 증명');

-- trail_running:Q4 · 수직의 증명 (여는 축: trail_running:고도, trail_running:최고 도달)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q4' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:고도',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '수직의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '수직의 증명', '미션으로만 얻는 열쇠입니다.', 'elevation_gain_m', '{"elevation_gain_m": 1500, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:고도', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:A1", "trail_running:E1"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '수직의 증명');

-- trail_running:Q5 · 해뜨기 전의 증명 (여는 축: trail_running:시간대, trail_running:주기)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q5' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:시간대',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1", "trail_running:T2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1", "trail_running:T2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '해뜨기 전의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '해뜨기 전의 증명', '미션으로만 얻는 열쇠입니다.', 'activity_count', '{"count": 9, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:시간대', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1", "trail_running:T2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3", "trail_running:T1", "trail_running:T2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '해뜨기 전의 증명');

-- trail_running:Q6 · 이어 달린 산길의 증명 (여는 축: trail_running:간격, trail_running:연속)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q6' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:간격',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:G1", "trail_running:N1", "trail_running:N2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:G1", "trail_running:N1", "trail_running:N2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '이어 달린 산길의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '이어 달린 산길의 증명', '미션으로만 얻는 열쇠입니다.', 'streak_days', '{"streak_days": 3, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:간격', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:G1", "trail_running:N1", "trail_running:N2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:G1", "trail_running:N1", "trail_running:N2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '이어 달린 산길의 증명');

-- trail_running:Q7 · 내리막 뒤의 증명 (여는 축: trail_running:휴식)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q7' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:휴식',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '내리막 뒤의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '내리막 뒤의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 50, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:휴식', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '내리막 뒤의 증명');

-- trail_running:Q8 · 사철 산길의 증명 (여는 축: trail_running:달력)
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = 'trail_running:Q8' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = 'trail_running:달력',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '사철 산길의 증명' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '사철 산길의 증명', '미션으로만 얻는 열쇠입니다.', 'distance', '{"distance_km": 240, "activity_type": "trail_running"}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, 'trail_running:달력', 'epic_to_mystic',
       '{"require_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "epic"}, "hide_when_owned": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "mystic"}, "unmet_visibility": "locked"}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '사철 산길의 증명');

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 게이트 미션 40건이 채워졌는지
-- SELECT count(*) FROM public.missions WHERE gate_axis IS NOT NULL;
--   → 40 이상(기존 게이트 미션이 있었다면 그만큼 더 많을 수 있다)
--
-- -- ② 축×단계 커버리지 — 어드민 /admin/gate-missions의 정합성 검사와 같은 기준
-- SELECT gate_axis, gate_stage, count(*) FROM public.missions
--  WHERE gate_axis IS NOT NULL GROUP BY 1,2 HAVING count(*) <> 1;
--   → 0행이어야 한다(한 축·단계에 미션 정확히 1개)
--
-- -- ③ 보상 배지 연결 확인
-- SELECT m.title, m.reward_badge_ids, b.name AS reward_name FROM public.missions m
--  LEFT JOIN public.badges b ON b.id = ANY(m.reward_badge_ids)
--  WHERE m.gate_axis IS NOT NULL AND (m.reward_badge_ids IS NULL OR array_length(m.reward_badge_ids,1) IS NULL);
--   → 0행(보상 배지가 비어 있으면 안 된다)

-- ↩️ 롤백 — 이 마이그레이션이 만든/전환한 게이트 미션만 되돌린다(제목 기준)
--    ⚠️ UPDATE로 전환된 기존 미션은 "게이트 미션이 되기 전 상태"를 모르므로 완전한 되돌리기가
--    아니라 게이트 필드만 다시 비운다.
--    BEGIN;
--    UPDATE public.missions SET gate_axis = NULL, gate_stage = NULL, visibility_rule_json = NULL
--     WHERE gate_axis IS NOT NULL;
--    -- 이 마이그레이션이 새로 INSERT한 행 자체를 지우려면 title로 특정해 DELETE한다(신규 40개
--    -- 제목 목록은 v5_gate_missions_sql_build.py의 MISSIONS 상수 참고).
--    COMMIT;
