-- 142: 2단 교차 게이트 — badges.condition_json에 축→계열 게이트 조건 채우기
--      (티켓 20260906_1947 ①, 마스터 20260905_0026 §게이트)
--
-- 배경:
--   v5 630종 시딩(마이그레이션/시드 0035 B2)에서 2단 교차 게이트를 한 행도 넣지 않았다.
--   실측(이 티켓 착수 전): cross_in_axis 0 · cross_between_axis 0 · gate_mission_badge 0 ·
--   mystic 98종. 이 파일이 그 98 Mystic + 해당 Epic(그리고 무한레벨형의 Lv.5~7/Lv.8+
--   구간)의 condition_json에 게이트 조건을 채운다.
--
-- 산출 방법 (손으로 쓰지 않음, 티켓 요구):
--   `Service Plan/Specs/Content/v5_gate_mapping_build.py`가 세 원본
--   (v5_catalog_design.json의 걷기.축간교차·걷기.축내교차짝·four종목.교차짝,
--    v5_catalog_verified.json의 교차게이트_정정 7건, v5_mission_badges.json·
--    v5_mission_axis_groups.json의 여는축)에서 family_key 단위 매핑을
--    `v5_gate_mapping.json`으로 산출했고, `v5_gate_mapping_sql_build.py`가 그 JSON만
--    읽어 이 UPDATE문을 기계적으로 만들었다. 규칙 요약은 두 스크립트의 docstring 참조.
--
-- min_level (②-b, crossGate.ts 확장):
--   무한레벨형(누적) 축이 보완 축으로 지정된 관계 13건에는 `min_rarity` 대신
--   `min_level: 5`(Epic→Mystic 상당)를 썼다 — 등급이 없어 「하나라도 보유」(Lv.1, 첫 주
--   달성)로 자동 통과되던 문제(티켓 20260906_0110 잔여 이슈)의 수정이다. 값 5는 걷기 K1
--   사다리 원본의 "Lv.5~7=cross 관문 진입" 경계를 그대로 가져온 것 — 상세 근거는
--   구현 요약의 alerts 참조. `src/lib/badge-engine/crossGate.ts`가 이 필드를 해석하고,
--   `src/lib/missions/visibility.ts`(ownedFamilyLevels)도 같은 값을 참조한다.
--
-- 대상이 없으면 no-op:
--   family_key + rarity(또는 level 구간)로만 좁혀 UPDATE한다 — K2 등 일부 계열이 아직
--   시딩되지 않았어도(티켓 20260906_0110 병행 작업분) 안전하게 0행 갱신으로 끝난다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--    98 Mystic + 관련 Epic을 한 번에 바꾸는 대량 변경이라 승인이 특히 중요하다.
--
-- 재실행 가능(idempotent): `condition_json || '{...}'::jsonb` 병합이라 같은 값으로 여러 번
-- 실행해도 결과가 같다(같은 키를 다시 그 값으로 덮어쓸 뿐).

BEGIN;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:D1", "cycling:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:C4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:D1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:D1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:D1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:D2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:D2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:V1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:E1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["cycling:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:E1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:G1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:E1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:G1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K1' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K1' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K2' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K2' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:C1", "cycling:C2", "cycling:C3", "cycling:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K3' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:K3' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:L1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:L1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:W1", "cycling:W2", "cycling:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M5' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:M5' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:X1", "cycling:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:N3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:L1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:P1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:N1", "cycling:N2", "cycling:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:P1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:E1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:V1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:G1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:V1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:M1", "cycling:M2", "cycling:M3", "cycling:M4", "cycling:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["cycling:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:W3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:X2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:X1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["cycling:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:X1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["cycling:X1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:X2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["cycling:K1", "cycling:K2", "cycling:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["cycling:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'cycling:X2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:A1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:A1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:D1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:C1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:C1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:D1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:C3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:C3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:D1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:C1", "hiking:C3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:D1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:G1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:G1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:C1", "hiking:C3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:K1' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:K1' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:C1", "hiking:C3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:K3' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:K3' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:L1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["hiking:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:L1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:A1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:L2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["hiking:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:L2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:W1", "hiking:W2", "hiking:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:M4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:X1", "hiking:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:N3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:L1", "hiking:L2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:P1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:N1", "hiking:N2", "hiking:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:P1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:M1", "hiking:M2", "hiking:M3", "hiking:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["hiking:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:W3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["hiking:X2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:X1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["hiking:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:X1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["hiking:X1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:X2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["hiking:K1", "hiking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["hiking:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'hiking:X2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:T1", "running:T2", "running:T3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:C4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:D1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:D1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:D1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:D2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:D2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:K1' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:K1' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:K3' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:K3' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:L1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:L1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:W1", "running:W2", "running:W3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M5' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:M5' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:D1", "running:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:D1", "running:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:D1", "running:D2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:X1", "running:X2", "running:X3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:N3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:L1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:P1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:N1", "running:N2", "running:N3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:P1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:C1", "running:C2", "running:C3", "running:C4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:M1", "running:M2", "running:M3", "running:M4", "running:M5"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:T3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["running:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:W3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["running:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["running:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["running:X1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["running:K1", "running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["running:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'running:X3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:A1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:G1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:A1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:T1", "trail_running:T2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:L1", "trail_running:L2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:C3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:A1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:E1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["trail_running:Q4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:E1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:N1", "trail_running:N2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:G1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:E1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:G1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K1' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K1' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K2' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K2' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K3' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:K3' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:L1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:L1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:L2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:L2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:W1", "trail_running:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:P1"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:M4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:N1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:N1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:G1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:N2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:X1", "trail_running:X2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:N2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:E1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:P1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:N1", "trail_running:N2"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:P1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["trail_running:T2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:T1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:T1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["trail_running:T1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:T2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:C1", "trail_running:C2", "trail_running:C3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:T2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:W1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:W1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:W2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:M1", "trail_running:M2", "trail_running:M3", "trail_running:M4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["trail_running:Q8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:W2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["trail_running:X2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:X1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["trail_running:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:X1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["trail_running:X1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:X2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["trail_running:K1", "trail_running:K2", "trail_running:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["trail_running:Q7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'trail_running:X2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A10' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A10' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A5' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A5' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A6' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A6' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A8' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A8' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:A10"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A9' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:S1", "walking:S2", "walking:S3"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:A9' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C5' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:W1", "walking:W2", "walking:W3", "walking:W4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M6"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:C5' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D0' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D0' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:D0"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:D3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:K1' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:K1' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:P1", "walking:P2", "walking:P3", "walking:P4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:K3' AND level BETWEEN 5 AND 7;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:K3' AND level >= 8;

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:P4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R4"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:R2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M7"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:R4' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:A1", "walking:A10", "walking:A2", "walking:A3", "walking:A4", "walking:A5", "walking:A6", "walking:A8", "walking:A9"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:R1", "walking:R2", "walking:R3", "walking:R4"], "min_rarity": "rare"}, "gate_mission_badge": {"family_keys": ["walking:M5"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:S3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W1' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W1' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:W1"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W2' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W2' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W3' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W3' AND rarity = 'mystic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_in_axis": {"family_keys": ["walking:W2"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W4' AND rarity = 'epic';

UPDATE public.badges SET condition_json = condition_json || '{"cross_between_axis": {"family_keys": ["walking:K1", "walking:K3"], "min_level": 5}, "gate_mission_badge": {"family_keys": ["walking:M8"]}}'::jsonb
 WHERE type = 'activity' AND deleted_at IS NULL AND family_key = 'walking:W4' AND rarity = 'mystic';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 게이트 조건이 실제로 몇 건 채워졌는지
-- SELECT
--   count(*) FILTER (WHERE condition_json ? 'cross_in_axis')      AS cross_in_axis_cnt,
--   count(*) FILTER (WHERE condition_json ? 'cross_between_axis') AS cross_between_axis_cnt,
--   count(*) FILTER (WHERE condition_json ? 'gate_mission_badge') AS gate_mission_badge_cnt,
--   count(*) FILTER (WHERE condition_json->'cross_between_axis' ? 'min_level') AS min_level_cnt
-- FROM public.badges WHERE type='activity' AND deleted_at IS NULL;
--   → cross_in_axis_cnt · cross_between_axis_cnt · gate_mission_badge_cnt 모두 0보다 커야 한다
--
-- -- ② 형태 오류가 없는지 — normalizeGateRequirement가 통과하는 계열만 있는지는
--    어드민 배지 폼 저장 검증(findCrossGateShapeError)이 매 배지 저장 시 확인한다.
--    이 마이그레이션은 UPDATE라 그 경로를 거치지 않으므로, 실행 직후
--    `npx tsx`로 direct 스모크를 권장한다(구현 요약 참고).
--
-- -- ③ 무관문 Mystic이 남아있지 않은지(누락 확인)
-- SELECT id, name, family_key FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND rarity='mystic'
--    AND NOT (condition_json ? 'cross_between_axis') AND NOT (condition_json ? 'gate_mission_badge')
--    AND NOT (condition_json ? 'mission_reward');
--   → 0행이어야 한다(전부 미션 보상 배지이거나 게이트가 걸려 있어야 한다)

-- ↩️ 롤백 — 이 파일이 추가한 키만 제거한다(다른 조건 필드는 건드리지 않는다)
--    BEGIN;
--    UPDATE public.badges
--       SET condition_json = condition_json - 'cross_in_axis' - 'cross_between_axis' - 'gate_mission_badge'
--     WHERE type = 'activity' AND deleted_at IS NULL
--       AND (condition_json ? 'cross_in_axis' OR condition_json ? 'cross_between_axis' OR condition_json ? 'gate_mission_badge');
--    COMMIT;
