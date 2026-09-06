-- seed: personal_record_break_metric 값 채우기 — 7계열 56종 (티켓 20260906_2055)
--
-- 배경: 마이그레이션 140이 personal_record_break_metric 필드를 스키마에 열었지만
-- 콘텐츠 값 채우기가 함께 이뤄지지 않아, 아래 7계열(각 8레벨=56종)의 condition_json이
-- activity_type·personal_record_break(레벨값)만 같고 문자 그대로 동일했다 —
-- walking:B1↔B2, hiking:R1↔R2, trail_running:R1↔R2↔R3.
--
-- 매핑 근거: Specs/Content/ACTIVITY_BADGES.md의 배지 설명 문구 + 사용자 확정
-- (2026-09-06 — "가장 긴 거리"는 단회 활동 기준 single_distance_km으로 확정).
--
--   walking:B1        가장 긴 거리 갱신     → single_distance_km
--   walking:B2        가장 긴 이동시간 갱신 → duration_minutes
--   hiking:R1          가장 높은 도달 고도   → max_elevation_m (해발고도, CONDITION_JSON_SPEC 정의와 일치)
--   hiking:R2          가장 긴 이동시간 갱신 → duration_minutes
--   trail_running:R1   가장 긴 거리 갱신     → single_distance_km
--   trail_running:R2   가장 높은 도달 고도   → max_elevation_m
--   trail_running:R3   가장 긴 이동시간 갱신 → duration_minutes
--
-- 이 마이그레이션은 스키마를 바꾸지 않는다 — condition_json 필드값만 채운다(140이 이미
-- personal_record_break_metric을 CHECK 허용 키에 넣어뒀다). 재실행해도 같은 값으로
-- 덮어써 안전하다(idempotent).

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'single_distance_km')
 WHERE family_key IN ('walking:B1', 'trail_running:R1')
   AND deleted_at IS NULL;

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'duration_minutes')
 WHERE family_key IN ('walking:B2', 'hiking:R2', 'trail_running:R3')
   AND deleted_at IS NULL;

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'max_elevation_m')
 WHERE family_key IN ('hiking:R1', 'trail_running:R2')
   AND deleted_at IS NULL;

-- ── 검증 쿼리 ────────────────────────────────────────────────────────────
-- SELECT family_key, condition_json->>'personal_record_break_metric' AS metric, count(*)
--   FROM public.badges
--  WHERE family_key IN ('walking:B1','walking:B2','hiking:R1','hiking:R2',
--                        'trail_running:R1','trail_running:R2','trail_running:R3')
--  GROUP BY 1, 2 ORDER BY 1;
-- -- 기대: 각 family_key당 8행, metric 값이 위 매핑과 일치, count=8
