-- seed_gate_mission_rest_axis_mystic_badges.sql — 자전거·등산·트레일러닝 "휴식" 축
--   (cycling:X1 · hiking:X1 · trail_running:X1) Mystic 배지 3종 신규 추가 +
--   미션 게이트(cross_between_axis + gate_mission_badge) 연결 (티켓 20260908_1033)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경: 티켓 20260908_1017 처리 중 발견된 `reward_family_not_gated` 3건
--   (trail_running:Q7 · hiking:Q7 · cycling:Q7 미션의 보상 배지가 아무 배지도 열지 못함)의
--   근본 원인 — 세 계열의 "휴식" 축(cycling:X1/hiking:X1/trail_running:X1)이 Epic까지만
--   시딩돼 있어 Mystic 게이트를 걸 대상 배지 자체가 없었다. 새 Mystic 배지를 만들어
--   해결한다. 상세: Service Plan/Tickets/P2-일반/20260908_1033_*.md
--
-- 대상 3계열은 이번 범위에서 X1만 다룬다(X2는 포함하지 않음 — 사유는 티켓 완료기록·
-- 잔여 이슈 참고).
--
-- 값 산정 근거: 같은 "휴식" 축의 걷기 선례(walking:R1 Epic5→Mystic20 = 4배,
-- walking:R2 Epic30→Mystic100 = 3.33배) — Epic→Mystic 배율 약 3.5배를 각 계열의 Epic
-- 값에 적용해 보기 좋은 정수로 반올림했다.
--   cycling:X1        Epic 30 × ~3.3배 → Mystic 100
--   hiking:X1         Epic 20 × ~3.5배 → Mystic 70
--   trail_running:X1  Epic 20 × ~3.5배 → Mystic 70
--
-- 게이트 조건: v5_gate_build.py(20260906_1947) AXIS_RULES의 '휴식' 축 em 규칙
--   {'between', '누적', 'min_level'} 그대로 적용 — cross_between_axis.family_keys는 각
--   종목의 "누적" 축 계열 전부(cycling: K1·K2·K3 / hiking: K1·K3(K2 없음, 설계상 결번) /
--   trail_running: K1·K2·K3), min_level=6(20260906_1947에서 이미 사용자 승인된 값과 동일).
--   gate_mission_badge.family_keys는 각 종목의 휴식 축 미션(Q7).
--
-- ── 실행 전 확인 (중복 방지) ────────────────────────────────────────────────
--   SELECT family_key, rarity FROM public.badges
--    WHERE family_key IN ('cycling:X1', 'hiking:X1', 'trail_running:X1')
--      AND rarity = 'mystic' AND type = 'activity' AND deleted_at IS NULL;
--   → 0행이어야 이 INSERT가 안전하다. 1행 이상이면 오케스트레이터가 먼저 확인할 것
--     (이미 Mystic 행이 있다면 이 티켓의 전제 자체가 틀린 것 — 재조사 필요).
--
-- 멱등: 아래 INSERT는 WHERE NOT EXISTS로 (family_key, rarity, level) 중복을 막는다.
-- 두 번 실행해도 안전하다.
--
-- ⚠️ 2026-09-08 실행 시 수정 — VALUES의 `level` 열이 문자열 리터럴들 사이에 섞인 순수 NULL이라
-- PostgreSQL이 타입을 text로 추론해 `b.level IS NOT DISTINCT FROM v.level`이
-- `integer = text` 오류로 실패했다(원본은 `NULL`이었음). `NULL::integer`로 명시해 고쳤다 —
-- 실행 완료 후 원본 형태를 이 값으로 교정해 남긴다(재실행해도 동일하게 성공하도록).

BEGIN;

INSERT INTO public.badges (
  name, description, type, rarity, level, family_key, sort_order,
  condition_json, activity_types, patch_available
)
SELECT v.name, v.description, v.type::badge_type, v.rarity::badge_rarity, v.level,
       v.family_key, v.sort_order, v.condition_json, v.activity_types, false
  FROM (VALUES
    -- cycling:X1 · 안장의 휴일 — 한 번에 150km 이상 다음 날 휴식 / 100회 (Mystic, 게이트: 누적 K1~K3 min_level 6 + 미션 Q7)
    ('안장의 휴일', '휴식은 이제 계획이 아니라 몸에 새겨진 습관입니다.', 'activity', 'mystic', NULL::integer, 'cycling:X1', 25,
     '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":100,"cross_between_axis":{"family_keys":["cycling:K1","cycling:K2","cycling:K3"],"min_level":6},"gate_mission_badge":{"family_keys":["cycling:Q7"]}}'::jsonb,
     ARRAY['cycling']::text[]),
    -- hiking:X1 · 하산 다음 날 — 한 번에 8시간 이상 다음 날 휴식 / 70회 (Mystic, 게이트: 누적 K1·K3 min_level 6 + 미션 Q7)
    ('하산 다음 날', '물러설 때를 아는 판단은 이제 몸에 새겨진 감각이 되었습니다.', 'activity', 'mystic', NULL::integer, 'hiking:X1', 20,
     '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":70,"cross_between_axis":{"family_keys":["hiking:K1","hiking:K3"],"min_level":6},"gate_mission_badge":{"family_keys":["hiking:Q7"]}}'::jsonb,
     ARRAY['hiking']::text[]),
    -- trail_running:X1 · 내리막의 대가 — 한 번에 35km 이상 다음 날 휴식 / 70회 (Mystic, 게이트: 누적 K1~K3 min_level 6 + 미션 Q7)
    ('내리막의 대가', '무너지지 않는 몸은 회복하는 법조차 본능으로 압니다.', 'activity', 'mystic', NULL::integer, 'trail_running:X1', 24,
     '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":70,"cross_between_axis":{"family_keys":["trail_running:K1","trail_running:K2","trail_running:K3"],"min_level":6},"gate_mission_badge":{"family_keys":["trail_running:Q7"]}}'::jsonb,
     ARRAY['trail_running']::text[])
  ) AS v(name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.badges b
    WHERE b.family_key = v.family_key
      AND b.rarity IS NOT DISTINCT FROM v.rarity::badge_rarity
      AND b.level  IS NOT DISTINCT FROM v.level
      AND b.deleted_at IS NULL
 );

COMMIT;

-- 확인용:
-- SELECT family_key, name, rarity, condition_json FROM public.badges
--  WHERE family_key IN ('cycling:X1', 'hiking:X1', 'trail_running:X1')
--    AND type = 'activity' AND deleted_at IS NULL
--  ORDER BY family_key, rarity;
-- → 각 계열 4행(Common·Rare·Epic·Mystic)이어야 하고, Mystic 행의 condition_json에
--   cross_between_axis·gate_mission_badge 키가 들어 있어야 한다.

-- ↩️ 롤백 — 이 시드가 넣은 행만 지운다
-- DELETE FROM public.badges
--  WHERE type = 'activity' AND rarity = 'mystic'
--    AND family_key IN ('cycling:X1', 'hiking:X1', 'trail_running:X1')
--    AND name IN ('안장의 휴일', '하산 다음 날', '내리막의 대가');
