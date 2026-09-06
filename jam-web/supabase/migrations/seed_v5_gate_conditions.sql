-- seed_v5_gate_conditions.sql — 2단 교차 게이트 축→계열 매핑 (티켓 20260906_1947)
--
-- 생성: v5_gate_build.py. 대상: 165행 (Epic 79 · Mystic 86).
-- 대상 범위: 98 Mystic 중 게이트가 있는 86종(연속·달력 축의 설계상 무관문 예외 12종 제외,
--          v5_gate_mapping.json의 게이트_없음_의도된_예외 참고) + 그 86종과 같은 계열의 Epic 79종.
-- 무한레벨형(누적 축) 계열 자신의 Lv.5+/Lv.8+ 게이트는 범위 밖 — 별도 콘텐츠 작업(완료기록 참고).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: 마이그레이션 133(cross_in_axis/cross_between_axis/gate_mission_badge 키)이
--   이미 배포돼 있어야 한다 — 이미 배포됨(확인됨). min_level은 위 세 키의 값(jsonb 객체)
--   내부 필드라 CHECK 제약 대상이 아니다(migration 133/135은 최상위 키만 검사) — 별도
--   마이그레이션이 필요 없다(이 티켓 ④ "먼저 확인" 결과).
--
-- jsonb 병합(||)이라 기존 조건 필드는 그대로 두고 게이트 키만 추가/덮어쓴다. 재실행해도
-- 안전하다(멱등) — 같은 값을 다시 병합할 뿐이다.
--
-- 검증(실행 후):
--   SELECT count(*) FROM badges WHERE type='activity' AND deleted_at IS NULL
--     AND condition_json ? 'cross_in_axis'; -- 예상 다수(within 대상)
--   SELECT count(*) FROM badges WHERE type='activity' AND deleted_at IS NULL
--     AND condition_json ? 'gate_mission_badge'; -- 예상 86

BEGIN;

-- cycling:주기:C-C1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb WHERE family_key = 'cycling:C1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:C1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb WHERE family_key = 'cycling:C2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:C2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb WHERE family_key = 'cycling:C3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:C3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C4 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb WHERE family_key = 'cycling:C4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:주기:C-C4 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:C4' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:요일:C-D1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:D2"]}}'::jsonb WHERE family_key = 'cycling:D1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:요일:C-D1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:D1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:요일:C-D2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:D1"]}}'::jsonb WHERE family_key = 'cycling:D2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:요일:C-D2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb WHERE family_key = 'cycling:D2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:고도:C-E1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:V1"]}}'::jsonb WHERE family_key = 'cycling:E1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:고도:C-E1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["cycling:Q4"]}}'::jsonb WHERE family_key = 'cycling:E1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:간격:C-G1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"]}}'::jsonb WHERE family_key = 'cycling:G1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:간격:C-G1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:E1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb WHERE family_key = 'cycling:G1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:단일 최대:C-L1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"]}}'::jsonb WHERE family_key = 'cycling:L1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:단일 최대:C-L1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q3"]}}'::jsonb WHERE family_key = 'cycling:L1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:이정표:C-M3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb WHERE family_key = 'cycling:M3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:이정표:C-M5 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb WHERE family_key = 'cycling:M5' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:연속:C-N1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"]}}'::jsonb WHERE family_key = 'cycling:N1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:연속:C-N1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb WHERE family_key = 'cycling:N1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:연속:C-N3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"]}}'::jsonb WHERE family_key = 'cycling:N3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:연속:C-N3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb WHERE family_key = 'cycling:N3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:강도:C-P1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"]}}'::jsonb WHERE family_key = 'cycling:P1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:강도:C-P1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q2"]}}'::jsonb WHERE family_key = 'cycling:P1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:최고 도달:C-V1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:E1"]}}'::jsonb WHERE family_key = 'cycling:V1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:최고 도달:C-V1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q2"]}}'::jsonb WHERE family_key = 'cycling:V1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:달력:C-W1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:W2"]}}'::jsonb WHERE family_key = 'cycling:W1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:달력:C-W1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q8"]}}'::jsonb WHERE family_key = 'cycling:W1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:달력:C-W2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:W1"]}}'::jsonb WHERE family_key = 'cycling:W2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- cycling:달력:C-W2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q8"]}}'::jsonb WHERE family_key = 'cycling:W2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:최고 도달:H-A1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"]}}'::jsonb WHERE family_key = 'hiking:A1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:최고 도달:H-A1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q2"]}}'::jsonb WHERE family_key = 'hiking:A1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:주기:H-C1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:D1"]}}'::jsonb WHERE family_key = 'hiking:C1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:주기:H-C1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb WHERE family_key = 'hiking:C1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:주기:H-C3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:D1"]}}'::jsonb WHERE family_key = 'hiking:C3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:주기:H-C3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb WHERE family_key = 'hiking:C3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:요일:H-D1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"]}}'::jsonb WHERE family_key = 'hiking:D1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:요일:H-D1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:C1", "hiking:C3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb WHERE family_key = 'hiking:D1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:간격:H-G1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"]}}'::jsonb WHERE family_key = 'hiking:G1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:간격:H-G1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q6"]}}'::jsonb WHERE family_key = 'hiking:G1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:단일 최대:H-L1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"]}}'::jsonb WHERE family_key = 'hiking:L1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:단일 최대:H-L1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["hiking:Q3"]}}'::jsonb WHERE family_key = 'hiking:L1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:단일 최대:H-L2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"]}}'::jsonb WHERE family_key = 'hiking:L2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:단일 최대:H-L2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["hiking:Q3"]}}'::jsonb WHERE family_key = 'hiking:L2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:이정표:H-M3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb WHERE family_key = 'hiking:M3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:연속:H-N1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:G1"]}}'::jsonb WHERE family_key = 'hiking:N1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:연속:H-N1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q5"]}}'::jsonb WHERE family_key = 'hiking:N1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:연속:H-N3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:G1"]}}'::jsonb WHERE family_key = 'hiking:N3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:연속:H-N3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q5"]}}'::jsonb WHERE family_key = 'hiking:N3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:강도:H-P1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"]}}'::jsonb WHERE family_key = 'hiking:P1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:강도:H-P1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q2"]}}'::jsonb WHERE family_key = 'hiking:P1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:달력:H-W1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["hiking:W2"]}}'::jsonb WHERE family_key = 'hiking:W1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:달력:H-W1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q8"]}}'::jsonb WHERE family_key = 'hiking:W1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:달력:H-W2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["hiking:W1"]}}'::jsonb WHERE family_key = 'hiking:W2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- hiking:달력:H-W2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q8"]}}'::jsonb WHERE family_key = 'hiking:W2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb WHERE family_key = 'running:C1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb WHERE family_key = 'running:C1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb WHERE family_key = 'running:C2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb WHERE family_key = 'running:C2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb WHERE family_key = 'running:C3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb WHERE family_key = 'running:C3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C4 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb WHERE family_key = 'running:C4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:주기:R-C4 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb WHERE family_key = 'running:C4' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:요일:R-D1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:D2"]}}'::jsonb WHERE family_key = 'running:D1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:요일:R-D1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb WHERE family_key = 'running:D1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:요일:R-D2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:D1"]}}'::jsonb WHERE family_key = 'running:D2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:요일:R-D2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb WHERE family_key = 'running:D2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:단일 최대:R-L1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"]}}'::jsonb WHERE family_key = 'running:L1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:단일 최대:R-L1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q3"]}}'::jsonb WHERE family_key = 'running:L1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:이정표:R-M3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb WHERE family_key = 'running:M3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:이정표:R-M5 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb WHERE family_key = 'running:M5' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:연속:R-N1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:D1", "running:D2"]}}'::jsonb WHERE family_key = 'running:N1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:연속:R-N1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q6"]}}'::jsonb WHERE family_key = 'running:N1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:연속:R-N3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:D1", "running:D2"]}}'::jsonb WHERE family_key = 'running:N3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:연속:R-N3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q6"]}}'::jsonb WHERE family_key = 'running:N3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:강도:R-P1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"]}}'::jsonb WHERE family_key = 'running:P1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:강도:R-P1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q2"]}}'::jsonb WHERE family_key = 'running:P1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:T2"]}}'::jsonb WHERE family_key = 'running:T1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb WHERE family_key = 'running:T1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:T1"]}}'::jsonb WHERE family_key = 'running:T2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb WHERE family_key = 'running:T2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"]}}'::jsonb WHERE family_key = 'running:T3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:시간대:R-T3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb WHERE family_key = 'running:T3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:달력:R-W1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:W2"]}}'::jsonb WHERE family_key = 'running:W1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:달력:R-W1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q8"]}}'::jsonb WHERE family_key = 'running:W1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:달력:R-W2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:W1"]}}'::jsonb WHERE family_key = 'running:W2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:달력:R-W2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q8"]}}'::jsonb WHERE family_key = 'running:W2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- running:휴식:R-X1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:X3"]}}'::jsonb WHERE family_key = 'running:X1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- running:휴식:R-X1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["running:Q7"]}}'::jsonb WHERE family_key = 'running:X1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:최고 도달:T-A1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"]}}'::jsonb WHERE family_key = 'trail_running:A1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:최고 도달:T-A1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:G1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q4"]}}'::jsonb WHERE family_key = 'trail_running:A1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb WHERE family_key = 'trail_running:C1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb WHERE family_key = 'trail_running:C1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb WHERE family_key = 'trail_running:C2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb WHERE family_key = 'trail_running:C2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb WHERE family_key = 'trail_running:C3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:주기:T-C3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb WHERE family_key = 'trail_running:C3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:고도:T-E1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:A1"]}}'::jsonb WHERE family_key = 'trail_running:E1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:고도:T-E1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["trail_running:Q4"]}}'::jsonb WHERE family_key = 'trail_running:E1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:간격:T-G1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:N1", "trail_running:N2"]}}'::jsonb WHERE family_key = 'trail_running:G1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:간격:T-G1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:E1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q6"]}}'::jsonb WHERE family_key = 'trail_running:G1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:단일 최대:T-L1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"]}}'::jsonb WHERE family_key = 'trail_running:L1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:단일 최대:T-L1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q3"]}}'::jsonb WHERE family_key = 'trail_running:L1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:단일 최대:T-L2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"]}}'::jsonb WHERE family_key = 'trail_running:L2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:단일 최대:T-L2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q3"]}}'::jsonb WHERE family_key = 'trail_running:L2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:이정표:T-M3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb WHERE family_key = 'trail_running:M3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:연속:T-N1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:G1"]}}'::jsonb WHERE family_key = 'trail_running:N1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:연속:T-N1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q6"]}}'::jsonb WHERE family_key = 'trail_running:N1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:강도:T-P1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:E1"]}}'::jsonb WHERE family_key = 'trail_running:P1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:강도:T-P1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:N1", "trail_running:N2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q2"]}}'::jsonb WHERE family_key = 'trail_running:P1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:시간대:T-T1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["trail_running:T2"]}}'::jsonb WHERE family_key = 'trail_running:T1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:시간대:T-T1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb WHERE family_key = 'trail_running:T1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- trail_running:달력:T-W1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 6}}'::jsonb WHERE family_key = 'trail_running:W1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb WHERE family_key = 'walking:A1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A10 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A9"]}}'::jsonb WHERE family_key = 'walking:A10' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A10 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A10' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb WHERE family_key = 'walking:A2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A6"]}}'::jsonb WHERE family_key = 'walking:A3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A4 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A6"]}}'::jsonb WHERE family_key = 'walking:A4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A4 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A4' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A5 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A1"]}}'::jsonb WHERE family_key = 'walking:A5' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A5 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A5' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A6 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A1"]}}'::jsonb WHERE family_key = 'walking:A6' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A6 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A6' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A8 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A9"]}}'::jsonb WHERE family_key = 'walking:A8' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A8 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A8' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A9 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb WHERE family_key = 'walking:A9' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:시간대:A9 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb WHERE family_key = 'walking:A9' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:이정표:C3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb WHERE family_key = 'walking:C3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:이정표:C5 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb WHERE family_key = 'walking:C5' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D0 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D1"]}}'::jsonb WHERE family_key = 'walking:D0' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D0 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb WHERE family_key = 'walking:D0' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb WHERE family_key = 'walking:D1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb WHERE family_key = 'walking:D1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb WHERE family_key = 'walking:D2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb WHERE family_key = 'walking:D2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb WHERE family_key = 'walking:D3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:요일:D3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb WHERE family_key = 'walking:D3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:P1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb WHERE family_key = 'walking:P1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:P2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb WHERE family_key = 'walking:P2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:P3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb WHERE family_key = 'walking:P3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P4 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:P4' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:주기:P4 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb WHERE family_key = 'walking:P4' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb WHERE family_key = 'walking:R1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb WHERE family_key = 'walking:R1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb WHERE family_key = 'walking:R2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb WHERE family_key = 'walking:R2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R3 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb WHERE family_key = 'walking:R3' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:휴식:R3 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb WHERE family_key = 'walking:R3' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:연속:S1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:S1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:연속:S1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M5"]}}'::jsonb WHERE family_key = 'walking:S1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:연속:S2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9", "walking:A10"]}}'::jsonb WHERE family_key = 'walking:S2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:연속:S2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M5"]}}'::jsonb WHERE family_key = 'walking:S2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:달력:W1 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:W2"]}}'::jsonb WHERE family_key = 'walking:W1' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:달력:W1 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb WHERE family_key = 'walking:W1' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:달력:W2 (epic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:W1"]}}'::jsonb WHERE family_key = 'walking:W2' AND rarity = 'epic' AND type = 'activity' AND deleted_at IS NULL;
-- walking:달력:W2 (mystic)
UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 6}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb WHERE family_key = 'walking:W2' AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;

COMMIT;
