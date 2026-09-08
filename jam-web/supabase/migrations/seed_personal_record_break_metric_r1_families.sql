-- seed: personal_record_break_metric 값 채우기 — 2계열 16종 (티켓 20260908_1438)
--
-- 배경: cycling:R1(바퀴의 한계)·running:R1(발끝의 한계)·running:R2(더 빠르게)가
-- personal_record_break만 쓰고 personal_record_break_metric이 전혀 없어
-- PAIR_ENFORCED_CONDITION_KEYS 강제로 각 8레벨 전부 unpaired로 막혀 있었다(전수 감사 2026-09-08).
--
-- 이 마이그레이션은 이 중 **cycling:R1·running:R1 2계열(16종)만** 채운다. running:R2는
-- 지표를 확정할 수 없어 제외했다(아래 HALT 사유 참고, 실행 보류).
--
-- 매핑 근거: Specs/Content/ACTIVITY_BADGES.md 배지 설명 문구, 지난 사례(티켓 20260906_2055
-- seed_personal_record_break_metric.sql)와 같은 원칙 — 「가장 긴 거리 갱신」은
-- walking:B1·trail_running:R1과 문자 그대로 동일한 설명이라 같은 지표(single_distance_km)로
-- 확정한다.
--
--   cycling:R1   바퀴의 한계   가장 긴 거리 갱신 → single_distance_km
--   running:R1   발끝의 한계   가장 긴 거리 갱신 → single_distance_km
--
-- ── running:R2 「더 빠르게」(5km 이상 활동의 가장 빠른 페이스 갱신)는 제외 — HALT ─────
--
-- 엔진이 지원하는 personal_record_break_metric은 3종뿐이다(SUPPORTED_PERSONAL_RECORD_METRICS,
-- activityFilters.ts): single_distance_km·duration_minutes·max_elevation_m. 셋 다 "값이 클수록
-- 갱신"(countPersonalRecordBreaks가 `value > best`만 본다)인데, running:R2가 원하는 건
-- "페이스가 빠를수록"(값이 작을수록) 갱신이다 — 3종 중 어느 것으로도 방향이 반대라
-- 문자 그대로 표현할 수 없다. 조건에 이미 있는 single_distance_km:5는 페이스 지표가 아니라
-- "5km 이상 활동만 본다"는 활동 1건 단위 필터(게이트)이므로 그대로 metric으로 채우면
-- "가장 긴 거리 갱신"으로 의미가 바뀌어 배지 설명과 어긋난다. duration_minutes로 채워도
-- "가장 오래 걸린(=가장 느린) 기록 갱신"이 되어 정반대 의미가 된다.
-- 지표를 추가하려면 코드 변경(감소 방향 기록을 세는 새 지표 또는 별도 페이스 지표 추가)이
-- 필요해 이 티켓의 범위(SQL 시딩만)를 벗어난다 — 실행하지 않고 HALT로 보고한다.
--
-- 재실행해도 같은 값으로 덮어써 안전하다(idempotent).

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'single_distance_km')
 WHERE family_key IN ('cycling:R1', 'running:R1')
   AND deleted_at IS NULL;

-- ── 검증 쿼리 ────────────────────────────────────────────────────────────
-- SELECT family_key, condition_json->>'personal_record_break_metric' AS metric, count(*)
--   FROM public.badges
--  WHERE family_key IN ('cycling:R1','running:R1')
--  GROUP BY 1, 2 ORDER BY 1;
-- -- 기대: 각 family_key당 8행, metric='single_distance_km', count=8
