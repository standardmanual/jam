-- JAM! user_mission_participations.progress_value 부동소수점 오염값 백필
-- 티켓: 20260902_0933 (홈 진행도카드 공통 포맷터 도입 + DB 백필 + 줄바꿈 수정)
-- 생성일: 2026-09-02
--
-- ⚠️⚠️⚠️ 절대 자동 실행 금지 ⚠️⚠️⚠️
-- 이 파일은 SQL만 작성한 것이다. STEP 1(진단, 읽기 전용)을 먼저 실행해 영향받는 로우 수를
-- 사용자에게 보고하고, 승인을 받은 뒤에만 STEP 2(백필)를 실행한다.
-- (jam-developer 서브에이전트는 이 파일을 실행할 권한이 없다 — 오케스트레이터가
-- 사용자 승인 후 별도로 처리한다.)
--
-- ────────────────────────────────────────────────────────────────────────────
-- 배경
-- ────────────────────────────────────────────────────────────────────────────
-- 티켓 20260902_0859에서 src/lib/missions/checker.ts의 calculateProgress()에
-- distance/elevation_gain_m 타입 반올림(Math.round(sum * 100) / 100)을 추가했지만,
-- 이 함수는 Strava 활동 동기화 시점(src/lib/strava/sync.ts:584 → checkMissions())에만
-- 호출되어 progress_value를 재계산·저장한다. 코드 수정 이전에 이미 저장된 기존 로우는
-- 다음 동기화가 일어나기 전까지 옛날 부동소수점 오염값(예: 245.99999999999997)을 그대로
-- 담고 있다 — 이것이 프로덕션에서 버그가 재현된 직접 원인이다.
--
-- calculateProgress()의 타입별 반환값 특성:
--   - distance, elevation_gain_m : Math.round(sum * 100) / 100  → 소수 2자리 반올림
--   - activity_count             : filtered.length               → 항상 정수
--   - checkin, item_collect      : 0 또는 1                       → 항상 정수
--   - streak_days                : calcMaxStreak() 정수 카운트    → 항상 정수
--   - duration_minutes           : Math.max(movingTimeSec/60)     → 반올림 없음(원본 유지)
--
-- 정수형 타입은 이미 정수라 소수 2자리 반올림을 적용해도 값이 바뀌지 않는다.
-- duration_minutes는 원래도 반올림 로직이 없어(코드상 의도된 원본값) 이 백필의 대상이
-- 아니다 — ROUND(value, 2)가 소수 2자리 밑을 잘라내면서 오히려 값을 바꿔버릴 위험이 있으므로
-- mission_type = 'duration_minutes'는 이 백필에서 제외한다.
--
-- 따라서 이 백필은 missions.mission_type IN ('distance', 'elevation_gain_m')에 해당하는
-- user_mission_participations 로우만 대상으로, progress_value를 ROUND(value::numeric, 2)로
-- 정규화한다 — calculateProgress()의 반올림 로직과 동일한 결과를 SQL 레벨에서 재현한다.

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1. 진단 (읽기 전용) — 반드시 먼저 실행하고 영향받는 로우 수를 보고할 것
-- ════════════════════════════════════════════════════════════════════════════

SELECT
  m.mission_type,
  COUNT(*) FILTER (
    WHERE ump.progress_value IS DISTINCT FROM ROUND(ump.progress_value::numeric, 2)
  ) AS affected_rows,
  COUNT(*) AS total_rows
FROM public.user_mission_participations ump
JOIN public.missions m ON m.id = ump.mission_id
WHERE m.mission_type IN ('distance', 'elevation_gain_m')
GROUP BY m.mission_type;

-- 참고용 — 오염값 표본 확인 (상위 20건)
-- SELECT ump.mission_id, ump.user_id, ump.progress_value, m.mission_type
--   FROM public.user_mission_participations ump
--   JOIN public.missions m ON m.id = ump.mission_id
--  WHERE m.mission_type IN ('distance', 'elevation_gain_m')
--    AND ump.progress_value IS DISTINCT FROM ROUND(ump.progress_value::numeric, 2)
--  ORDER BY ump.joined_at DESC
--  LIMIT 20;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2. 백필 (STEP 1 결과 검토·승인 후에만 실행)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.user_mission_participations ump
   SET progress_value = ROUND(ump.progress_value::numeric, 2)
  FROM public.missions m
 WHERE m.id = ump.mission_id
   AND m.mission_type IN ('distance', 'elevation_gain_m')
   AND ump.progress_value IS DISTINCT FROM ROUND(ump.progress_value::numeric, 2);

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- 적용 후 확인 쿼리 (조회 전용)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS remaining_dirty
--   FROM public.user_mission_participations ump
--   JOIN public.missions m ON m.id = ump.mission_id
--  WHERE m.mission_type IN ('distance', 'elevation_gain_m')
--    AND ump.progress_value IS DISTINCT FROM ROUND(ump.progress_value::numeric, 2);
--  → remaining_dirty = 0 이어야 한다.
