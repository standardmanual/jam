-- seed: personal_record_break_metric 값 채우기 — 잔여 4계열 32종 (티켓 20260908_1318)
--
-- 배경: `seed_personal_record_break_metric.sql`(티켓 20260906_2055)이 7계열 56종의
-- personal_record_break_metric을 채웠지만, 아래 4계열(walking:B3·walking:B4·running:R3·
-- cycling:R2, 각 8레벨=32종)은 그때 범위 밖으로 빠졌다. 이 4계열은 personal_record_break를
-- month_over_month_ratio(또는 vs_personal_average)와 함께 쓰는데, 짝 필드
-- (personal_record_break_metric)가 없으면 PAIR_ENFORCED_CONDITION_KEYS의 fail-closed가
-- "짝 필드 없음"으로 계속 막는다 — month_over_month_ratio·vs_personal_average를
-- evaluation:'engine'으로 뒤집어도(20260908_1318) 이 4계열은 여전히 발급되지 않는다.
--
-- 매핑 근거: `seed_v5_activity_badges.sql`의 배지 설명 주석이 전부 "거리" 기준이다
-- (walking:B3·running:R3·cycling:R2 "한 달에 지난달 거리의 120% 이상",
--  walking:B4 "한 번에 평소 평균 거리의 2배 이상") — walking:B1("가장 긴 거리 갱신")과
-- 같은 지표(single_distance_km)로 통일한다.
--
-- 이 마이그레이션은 스키마를 바꾸지 않는다 — condition_json 필드값만 채운다. 재실행해도
-- 같은 값으로 덮어써 안전하다(idempotent).

UPDATE public.badges
   SET condition_json = condition_json || jsonb_build_object('personal_record_break_metric', 'single_distance_km')
 WHERE family_key IN ('walking:B3', 'walking:B4', 'running:R3', 'cycling:R2')
   AND deleted_at IS NULL;

-- ── 검증 쿼리 ────────────────────────────────────────────────────────────
-- SELECT family_key, condition_json->>'personal_record_break_metric' AS metric, count(*)
--   FROM public.badges
--  WHERE family_key IN ('walking:B3','walking:B4','running:R3','cycling:R2')
--  GROUP BY 1, 2 ORDER BY 1;
-- -- 기대: 각 family_key당 8행, metric='single_distance_km', count=8
