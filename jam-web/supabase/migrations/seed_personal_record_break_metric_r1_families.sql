-- seed: personal_record_break_metric 값 채우기 — 3계열 24종 (티켓 20260908_1438)
--
-- 배경: cycling:R1(바퀴의 한계)·running:R1(발끝의 한계)·running:R2(더 빠르게)가
-- personal_record_break만 쓰고 personal_record_break_metric이 전혀 없어
-- PAIR_ENFORCED_CONDITION_KEYS 강제로 각 8레벨 전부 unpaired로 막혀 있었다(전수 감사 2026-09-08).
--
-- 매핑 근거: Specs/Content/ACTIVITY_BADGES.md 배지 설명 문구, 지난 사례(티켓 20260906_2055
-- seed_personal_record_break_metric.sql)와 같은 원칙 — 「가장 긴 거리 갱신」은
-- walking:B1·trail_running:R1과 문자 그대로 동일한 설명이라 같은 지표(single_distance_km)로
-- 확정한다.
--
--   cycling:R1   바퀴의 한계   가장 긴 거리 갱신             → single_distance_km
--   running:R1   발끝의 한계   가장 긴 거리 갱신             → single_distance_km
--   running:R2   더 빠르게     5km 이상 활동의 가장 빠른 페이스 갱신 → max_pace_sec_per_km
--
-- running:R2는 최초 작성 시(2026-09-08 1차 라운드) 엔진(activityFilters.ts)이
-- "값이 클수록 갱신" 방향(higher)만 지원해 "값이 작을수록(빠를수록) 갱신"인 페이스를
-- 표현할 수 없어 HALT로 보류했다. 이후 countPersonalRecordBreaks가 지표별 방향
-- (PERSONAL_RECORD_METRIC_DIRECTION, higher/lower)을 지원하도록 확장되고
-- SUPPORTED_PERSONAL_RECORD_METRICS에 max_pace_sec_per_km(lower)가 추가되어(같은 티켓
-- 2차 라운드) 이제 채울 수 있다. 조건에 이미 있는 single_distance_km:5는 활동 1건 단위
-- 필터("5km 이상 활동만 본다")이고 personal_record_break_metric은 그 필터를 통과한 활동들
-- 사이에서 무엇을 기록으로 볼지 지정하는 별도 축이라 서로 충돌하지 않는다.
--
-- 재실행해도 같은 값으로 덮어써 안전하다(idempotent).

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'single_distance_km')
 WHERE family_key IN ('cycling:R1', 'running:R1')
   AND deleted_at IS NULL;

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'max_pace_sec_per_km')
 WHERE family_key = 'running:R2'
   AND deleted_at IS NULL;

-- ── 검증 쿼리 ────────────────────────────────────────────────────────────
-- SELECT family_key, condition_json->>'personal_record_break_metric' AS metric, count(*)
--   FROM public.badges
--  WHERE family_key IN ('cycling:R1','running:R1','running:R2')
--  GROUP BY 1, 2 ORDER BY 1;
-- -- 기대: cycling:R1·running:R1 각 8행 metric='single_distance_km',
-- --       running:R2 8행 metric='max_pace_sec_per_km' (계 24행)
