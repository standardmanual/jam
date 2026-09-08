-- seed_gate_mission_leveled_visibility_fix.sql — 게이트미션 "누적" 축 5종 정합성 오류 교정
-- (티켓 20260908_1017)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ⚠️ 실행 전 필수 확인(티켓 본문 지시) — 이 파일의 UPDATE 대상 family_key·level·
--    rarity IS NULL 조합은 `seed_v5_activity_badges.sql`(이미 실행됨) 기준으로
--    존재를 확인했다(아래 검증 SELECT ①). 그러나 실 DB 상태가 시딩 스크립트와
--    어긋날 수 있다는 것이 이 티켓의 근본 원인 계열 사례(20260906_1947 "Epic까지만
--    시딩된 3계열")이므로, **실행 직전 반드시 아래 SELECT로 재확인할 것**:
--
--   SELECT family_key, level, rarity, deleted_at FROM public.badges
--    WHERE type = 'activity' AND rarity IS NULL
--      AND (family_key, level) IN (
--        ('walking:K1', 8), ('walking:K3', 6),
--        ('running:K1', 8), ('running:K3', 6),
--        ('cycling:K1', 8), ('cycling:K2', 6), ('cycling:K3', 6),
--        ('hiking:K1', 6), ('hiking:K3', 6),
--        ('trail_running:K1', 8), ('trail_running:K2', 7), ('trail_running:K3', 6)
--      );
--   → 12행이 나와야 하고, 전부 deleted_at IS NULL이어야 한다. 모자라거나
--     deleted_at이 채워진 행이 있으면 ②의 UPDATE 전에 먼저 원인을 파악할 것.
--
BEGIN;

-- ── ① 노출조건(visibility_rule_json) 교정 — min_rarity → min_level 완전 교체 ──
--
-- crossGate.ts normalizeGateRequirement가 min_rarity/min_level을 상호배타로 검증하므로
-- min_rarity 키를 남기지 않고 값 전체를 새 객체로 덮어쓴다.
--
-- hide_when_owned min_level = 대상 계열 중 최단 사다리 상한(5종목 전부 6)
-- require_owned   min_level = 그 절반(내림) = 3
-- (근거: 티켓 20260908_1017 §임계값 산정 기준. confidence: medium — 콘텐츠 팀 재검토 여지 있음)

-- walking:누적 (누적의 증명 → walking:M1) 대상: walking:K1(8) · walking:K3(6)
UPDATE public.missions
SET visibility_rule_json = '{"require_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}}'::jsonb
WHERE gate_axis = 'walking:누적' AND mission_type = 'engine_condition';

-- running:누적 (쌓인 거리의 증명 → running:Q1) 대상: running:K1(8) · running:K3(6)
UPDATE public.missions
SET visibility_rule_json = '{"require_owned": {"family_keys": ["running:K1", "running:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["running:K1", "running:K3"], "min_level": 6}}'::jsonb
WHERE gate_axis = 'running:누적' AND mission_type = 'engine_condition';

-- cycling:누적 (바퀴 자국의 증명 → cycling:Q1) 대상: cycling:K1(8) · K2(6) · K3(6)
UPDATE public.missions
SET visibility_rule_json = '{"require_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 6}}'::jsonb
WHERE gate_axis = 'cycling:누적' AND mission_type = 'engine_condition';

-- hiking:누적 (쌓인 고도의 증명 → hiking:Q1) 대상: hiking:K1(6) · hiking:K3(6)
UPDATE public.missions
SET visibility_rule_json = '{"require_owned": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 6}}'::jsonb
WHERE gate_axis = 'hiking:누적' AND mission_type = 'engine_condition';

-- trail_running:누적 (오르내린 거리의 증명 → trail_running:Q1) 대상: K1(8) · K2(7) · K3(6)
UPDATE public.missions
SET visibility_rule_json = '{"require_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 3}, "hide_when_owned": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 6}}'::jsonb
WHERE gate_axis = 'trail_running:누적' AND mission_type = 'engine_condition';

-- ── ② 보상 배지 게이트 연결 — 각 "누적" 축 계열의 최고 레벨 행에 gate_mission_badge 부여 ──
--
-- jsonb 병합(||)으로 기존 condition_json 필드는 유지하고 gate_mission_badge만 추가한다.
-- 대상은 각 계열의 자기 사다리 최고 레벨 행(위 검증 SELECT와 동일한 12행).

-- walking:M1 (누적의 증명)을 walking:K1·walking:K3 최고 레벨의 게이트로 연결
UPDATE public.badges
SET condition_json = condition_json || '{"gate_mission_badge": {"family_keys": ["walking:M1"]}}'::jsonb
WHERE type = 'activity' AND rarity IS NULL AND deleted_at IS NULL
  AND ((family_key = 'walking:K1' AND level = 8) OR (family_key = 'walking:K3' AND level = 6));

-- running:Q1 (쌓인 거리의 증명)을 running:K1·running:K3 최고 레벨의 게이트로 연결
UPDATE public.badges
SET condition_json = condition_json || '{"gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
WHERE type = 'activity' AND rarity IS NULL AND deleted_at IS NULL
  AND ((family_key = 'running:K1' AND level = 8) OR (family_key = 'running:K3' AND level = 6));

-- cycling:Q1 (바퀴 자국의 증명)을 cycling:K1·K2·K3 최고 레벨의 게이트로 연결
UPDATE public.badges
SET condition_json = condition_json || '{"gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
WHERE type = 'activity' AND rarity IS NULL AND deleted_at IS NULL
  AND ((family_key = 'cycling:K1' AND level = 8) OR (family_key = 'cycling:K2' AND level = 6) OR (family_key = 'cycling:K3' AND level = 6));

-- hiking:Q1 (쌓인 고도의 증명)을 hiking:K1·K3 최고 레벨의 게이트로 연결
UPDATE public.badges
SET condition_json = condition_json || '{"gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
WHERE type = 'activity' AND rarity IS NULL AND deleted_at IS NULL
  AND ((family_key = 'hiking:K1' AND level = 6) OR (family_key = 'hiking:K3' AND level = 6));

-- trail_running:Q1 (오르내린 거리의 증명)을 trail_running:K1·K2·K3 최고 레벨의 게이트로 연결
UPDATE public.badges
SET condition_json = condition_json || '{"gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
WHERE type = 'activity' AND rarity IS NULL AND deleted_at IS NULL
  AND ((family_key = 'trail_running:K1' AND level = 8) OR (family_key = 'trail_running:K2' AND level = 7) OR (family_key = 'trail_running:K3' AND level = 6));

COMMIT;

-- 🧪 적용 후 검증
--   1) UPDATE 문 5개(①)가 각각 1행씩 갱신됐는지: 실행 직후 각 UPDATE의 "UPDATE 1" 결과 확인.
--   2) UPDATE 문 5개(②)가 각각 대상 개수만큼(walking 2 / running 2 / cycling 3 / hiking 2 /
--      trail_running 3 = 총 12행) 갱신됐는지 확인.
--   3) 어드민 게이트미션 관리 화면(/admin/gate-missions)에서 정합성 검사를 다시 돌려
--      rarity_requirement_on_leveled_family(24건) · reward_family_not_gated(5건)가
--      모두 사라졌는지 확인. staging 배포 없이 로컬(NODE_ENV=development, ADMIN_EMAILS)
--      실렌더로 확인한다 — 어드민 화면은 staging 검증 불가(SERVICE_OPERATIONS.md 패턴 13).
