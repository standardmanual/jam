-- 291_seed_activity_badge_family_5_6.sql
-- JAM 2.0 액티비티 배지: 5-6 계열 «같은 장소에 여러 날 체크인함»(혼자들 «채워 둔 세제 칸») 입력 (티켓 20261026_1018, 상위 20261022_1131. 이름·설명은 2026-10-25 사용자 확정, 원고 11.5절)
--
-- 작성만 하고 실행하지 않았다. 실행은 오픈 직전에 사용자 승인과 롤백 실측 뒤 카리나가 한다(오픈 전후 적용 순서 문서 4절). 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행과 245·248의 행은 바꾸지 않는다).
-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs --set late (원고 06 액티비티 배지.md 2·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    넣는 행: 1계열 3행(활동 배지, 등급형 3단). 옛 프로덕션의 배지함·배지 목록·어드민 배지 목록에 새 배지가 나타난다.
--    같은 장소에 서로 다른 날 5일 이상 체크인한 유저는 다음 동기화 끝 판정(JAM_SYNC_TRIGGERS의 same_spot_checkin_days)에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.
--    등급형이라 채운 가장 높은 단계 하나만 받는다.
--    same_spot_checkin_days는 203이 허용한 기존 JAM! 지표다. 옛 프로덕션 코드가 이 키로 배지를 판정하는지는 이 파일에서 확인하지 않았다(판정 코드는 이 브랜치의 jamActionBadges.ts에 있다). 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.
--
-- ⚠️ 적용 순서: 244 → 245 → 248 → 이 파일. 이 파일은 244·245·248이 모두 적용된 «뒤에» 적용한다.
--    244(재활용 후보 밖 활동 배지를 끄는 SQL)의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 244보다 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.
--    아래 가드 ③이 활성 액티비티 배지 수(270 + 245의 61 + 248의 59 = 390)를 대조해, 244·245·248 적용 전에는 멈춘다.
--    245·248의 드라이런·사후 검증 기대값(포인트 합 1410, 1650 등)은 이 파일을 넣기 «전» 숫자이므로 그 검증도 이 파일 앞에서 돌린다.
--    이 파일은 CHECK 제약을 새로 만들지 않는다. 허용 키 92개는 247까지 적용돼 있어야 한다(246: 86개, 247: 92개, 둘 다 적용 완료). 드라이런 ④가 같은 식으로 새 행을 미리 대조한다.
--
-- ⚠️ 마이그레이션 290(기존 액티비티 배지 포인트 일괄 적용)과의 관계 — 활성 액티비티 배지 수가 이 파일로 390 → 393이 된다
--    290의 선행 조건 가드는 «활성 액티비티 배지가 390개일 때만 진행»이다. 290은 배지 수를 바꾸지 않으므로 이 파일의 가드 ③은 290 앞에서도 뒤에서도 통과한다.
--    (가) 290을 먼저, 이 파일을 나중에: 290은 고치지 않고 통과한다. 다만 이 파일의 포인트는 아래 규칙 ②의 고정값이라, 290 뒤에 배지 포인트 일괄 값(badge_point_policy)을 바꿨다면 이 행은 그 값을 따르지 않는다.
--    (나) 이 파일을 먼저, 290을 나중에: 290의 가드가 393개를 보고 멈춘다(아무것도 바꾸지 않는다). 이 순서를 쓰려면 290의 가드와 안내 문구의 기대 수를 390에서 393(270 + 245의 61 + 248의 59 + 이 파일의 3)까지 올려 고쳐야 한다.
--         이 행들은 290의 범위(삭제되지 않은 숨김 아님 액티비티 배지)에 들어가 정책 표 값으로 다시 쓰인다.
--    어느 쪽을 쓸지는 카리나가 정한다. 이 파일의 작업에서는 290을 고치지 않았다.
--
-- 규칙
--   ① 넣는 계열(원고 번호): 5-6 (1개 번호, family_key 1개). 원고 11.5절의 이름·설명·조건 표기를 한 글자도 바꾸지 않고 쓴다. 트라이브는 혼자들이고 이름 «채워 둔 세제 칸»은 3단이 같다.
--      등급형이라 rarity(Common·Rare·Epic)만 있고 level은 NULL이다(130 제약 badges_rarity_level_exclusive). 숨김 배지는 없다(is_hidden 전부 false).
--   ② point_reward: Common 10·Rare 20·Epic 50(합 80). 245·248과 같은 규칙 값이고 배지 포인트 일괄 값(badge_point_policy, 288)의 기본값과 같다. 숨김이 아니라서 badges_hidden_no_points 제약과 부딪히지 않는다.
--   ③ condition_json: {same_spot_checkin_days: 5 | 20 | 50} (단계마다 키 하나). 지점(poi_id)별로 센 서로 다른 체크인 날(KST) 수의 최댓값이다. 여러 장소의 합이 아니다.
--      판정은 엔진 밖 파이프라인(jamActionBadges.ts)이 한다. 메인 엔진은 이 키만 든 조건을 항상 fail 처리한다.
--   ④ activity_types·admin_category·family_key: 종목과 상관없이 합산하는 계열이라 activity_types='{}'·admin_category NULL(JAM! 필터에 넣지 않는다)·family_key `all:J5-6`이다(248의 합산 계열과 같다).
--      → 배지 목록의 «전체»에는 나오지만 종목 필터에는 나오지 않는다. 종목을 붙일지는 따로 정한다.
--      적용 전에 같은 family_key가 이미 있으면 가드 ①이, 같은 이름의 살아 있는 배지가 있으면 가드 ②가 예외를 던져 전체를 되돌린다(되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).
--   ⑤ branch_key: explore(243의 가지 일곱 중 하나). sort_order = 가지 번호×100 + 계열 번호 = 506. 공개 기간(valid_from·valid_until)은 두지 않는다.
--   ⑥ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째다.
--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.
--   ⑦ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일은 단계마다 같은 키 하나라 통과한다.
--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.
--
-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)
--   all:J5-6                 5-6   채워 둔 세제 칸      ← walking:K3 (3행 ← 원본 단계를 비례로 대응)
--
-- 되돌림 방법과 사후 확인은 파일 끝에 있다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값: ① 0행 ② 0행 ③ 줄마다 이미지있음 = 행수(모자라면 그 계열을 원본으로 삼은 새 행의 image_url이 NULL이 된다) ④ 위반 0 ⑤ 적용 전 기준값
--
-- ① 같은 family_key가 이미 있는가 (0행이어야 한다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('all:J5-6') GROUP BY family_key;
--
-- ② 같은 이름이 살아 있는 배지에 이미 있는가 (0행이어야 한다. 등급형은 같은 이름이 한 계열 안에서만 반복된다)
--   SELECT name, type, family_key FROM public.badges WHERE deleted_at IS NULL AND name IN ('채워 둔 세제 칸');
--
-- ③ 이미지 원본: 계열마다 행 수와 image_url이 있는 행 수
--   SELECT family_key, count(*) AS 행수, count(image_url) AS 이미지있음 FROM public.badges WHERE family_key IN ('walking:K3') GROUP BY family_key ORDER BY family_key;
--
-- ④ 새 행의 condition_json이 허용 키 92개 CHECK를 통과하는지 (위반 행이 0이어야 한다. CHECK 식과 같은 식이다)
--   WITH allowed AS (SELECT array_agg(k) AS keys FROM unnest(ARRAY['distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours', 'total_count', 'streak_days', 'weekly_count', 'month', 'monthly_km', 'season_count', 'season_count_all', 'active_days_count', 'time_range', 'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m', 'avg_heartrate_bpm', 'avg_watts', 'avg_cadence', 'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days', 'daily_once_count', 'weekly_streak', 'distinct_time_bands', 'activities_within_hours', 'personal_record_break', 'month_over_month_ratio', 'vs_personal_average', 'repeat_count', 'cumulative_duration_hours', 'monthly_count', 'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route', 'poi_id', 'season', 'same_activity', 'negative_split', 'day_of_month', 'cross_in_axis', 'cross_between_axis', 'gate_mission_badge', 'personal_record_break_metric', 'mission_reward', 'follower_count', 'following_count', 'daily_sync_count', 'daily_sync_streak_days', 'checkin_category_count', 'checkin_badge_count', 'combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success', 'drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count', 'mission_complete_count', 'collection_complete_count', 'days_since_signup', 'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days', 'capsule_open_count', 'locked_item_open_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count', 'cross_tribe_combine_success_count', 'jam_total_earned', 'jam_weekly_earned', 'chapter_reached', 'active_week_streak', 'active_week_min_days', 'return_streak_weeks', 'full_week_count', 'full_season_year_count', 'distinct_activity_type_count', 'new_checkin_badge_count', 'checkin_season_year_count', 'dropped_item_picked_up_count', 'jam_week_count', 'jam_week_streak', 'jam_week_min_earned']::text[]) AS k),
--   rows(label, condition_json) AS (VALUES
--     ('all:J5-6/common', '{"same_spot_checkin_days":5}'::jsonb),
--     ('all:J5-6/rare', '{"same_spot_checkin_days":20}'::jsonb),
--     ('all:J5-6/epic', '{"same_spot_checkin_days":50}'::jsonb)
--   )
--   SELECT count(*) FILTER (WHERE r.condition_json - a.keys <> '{}'::jsonb) AS 위반, count(*) AS 전체 FROM rows r, allowed a;
--
-- ⑤ 현재 활동 배지 수(적용 전 기준값. 적용 뒤에는 이 값 + 새 행 수가 된다)
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
--
-- ⑥ 245가 들어갔는가: 245의 14계열 61행이 있어야 한다(기대값 14 / 61. 아니면 245를 먼저 적용한다)
--   SELECT count(DISTINCT family_key) AS 계열수, count(*) AS 행수 FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND deleted_at IS NULL;
--
-- ⑦ 248이 들어갔는가: 248의 17계열 59행이 있어야 한다(기대값 17 / 59. 아니면 248을 먼저 적용한다)
--   SELECT count(DISTINCT family_key) AS 계열수, count(*) AS 행수 FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') AND deleted_at IS NULL;
--
-- ⑧ 244가 들어갔는가: 활성 활동 배지 가운데 새 계열(`:J<번호>` 형식 family_key)이 아닌 것의 수는 244의 «유지 270행»만 남아 있어야 한다
--   (기대값 270. 244의 기대값과 같은 2026-10-10 조사 기준이라 그 뒤에 옛 형식 배지를 더했다면 달라질 수 있다).
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL AND (family_key IS NULL OR family_key !~ ':J[0-9]+-[0-9]+$');
--
-- ⑨ 가드 ③과 같은 식: 위 ⑤의 활성 활동 배지 수가 390이어야 이 파일이 통과한다(= 270 + 245의 61 + 248의 59. 적용 뒤에는 393).
--   290(기존 액티비티 배지 포인트 일괄 적용)을 이미 적용했는지는 개수에 나타나지 않는다: SELECT to_regclass('public.badge_point_backup_290'); 가 NULL이 아니면 적용했다.
--
-- 롤백 실측: 아래 BEGIN 이후 본문(가드 DO 블록, INSERT, 사후 확인 DO 블록)을 한 트랜잭션으로 실행하고 COMMIT 대신 ROLLBACK 한다.
--   트랜잭션을 못 쓰는 도구(MCP)에서는 본문을 DO 블록 하나로 감싸 마지막에 RAISE EXCEPTION으로 되돌린다(CHECK·트리거·가드 통과를 실측한다).

BEGIN;

-- 가드 ①: 같은 family_key가 이미 있으면 멈춘다 (되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다)
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN ('all:J5-6')) THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 이미 같은 family_key를 가진 배지가 있다. 드라이런 ①로 확인한다';
  END IF;
END
$guard$;

-- 가드 ②: 같은 이름의 살아 있는 배지가 이미 있으면 멈춘다 (드라이런 ②와 같은 식)
DO $guard_name$
BEGIN
  IF EXISTS (SELECT 1 FROM public.badges WHERE deleted_at IS NULL AND name IN ('채워 둔 세제 칸')) THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 같은 이름의 배지가 이미 있다. 드라이런 ②로 확인한다';
  END IF;
END
$guard_name$;

-- 가드 ③: 활성 액티비티 배지 수가 390개(270 + 245의 61 + 248의 59)일 때만 진행한다. 244·245·248이 모두 적용된 뒤라는 뜻이다(244가 새 행을 끄는 순서 사고를 막는다)
DO $guard_count$
DECLARE
  v_active int;
BEGIN
  SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
  IF v_active <> 390 THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 244, 245, 248 적용 전이거나 건수가 계획과 다르다: 활성 액티비티 배지 %개(계획 390개 = 270 + 245의 61 + 248의 59). 아무것도 넣지 않고 멈춘다', v_active;
  END IF;
END
$guard_count$;

-- 3행 입력 (1계열)
WITH new_rows (name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types, point_reward, branch_key, admin_category, src_family_key, pos, total) AS (
  VALUES
    ('채워 둔 세제 칸', '빨래방 공용 세제 칸이 가득 차 있습니다. 누가 채웠는지는 아무도 묻지 않습니다.', 'activity', 'common', NULL, 'all:J5-6', 506, '{"same_spot_checkin_days":5}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 1, 3),
    ('채워 둔 세제 칸', '바닥이 보이던 세제 칸이 다시 찼습니다. 채운 통은 벌써 자리에 없습니다.', 'activity', 'rare', NULL, 'all:J5-6', 506, '{"same_spot_checkin_days":20}'::jsonb, ARRAY[]::text[], 20, 'explore', NULL, 'walking:K3', 2, 3),
    ('채워 둔 세제 칸', '세제를 들고 칸 앞에 섭니다. 칸이 차면 말없이 돌아섭니다.', 'activity', 'epic', NULL, 'all:J5-6', 506, '{"same_spot_checkin_days":50}'::jsonb, ARRAY[]::text[], 50, 'explore', NULL, 'walking:K3', 3, 3)
),
src AS (
  SELECT family_key AS src_family_key, image_url,
         row_number() OVER (PARTITION BY family_key ORDER BY COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END), id) AS rn,
         count(*) OVER (PARTITION BY family_key) AS n
    FROM public.badges
   WHERE family_key IN ('walking:K3')
)
INSERT INTO public.badges (
  name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types,
  patch_available, point_reward, is_hidden, branch_key, admin_category, image_url
)
SELECT r.name, r.description, r.type::badge_type, r.rarity::badge_rarity, r.level, r.family_key, r.sort_order, r.condition_json, r.activity_types,
       false, r.point_reward, false, r.branch_key, r.admin_category, s.image_url
  FROM new_rows r
  LEFT JOIN src s ON s.src_family_key = r.src_family_key AND s.rn = ceil(r.pos::numeric * s.n / r.total)::int;

-- 사후 확인(같은 트랜잭션 안): 어긋나면 예외로 전체를 되돌린다
DO $verify$
DECLARE
  v_rows int; v_fams int; v_points int; v_hidden int; v_ungrouped int; v_active int;
BEGIN
  SELECT count(*), count(DISTINCT family_key), COALESCE(sum(point_reward), 0), count(*) FILTER (WHERE is_hidden)
    INTO v_rows, v_fams, v_points, v_hidden
    FROM public.badges WHERE family_key IN ('all:J5-6') AND deleted_at IS NULL;
  IF v_rows <> 3 OR v_fams <> 1 OR v_points <> 80 OR v_hidden <> 0 THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 사후 확인 실패 (행 %, 계열 %, 포인트 합 %, 숨김 %) — 기대값 3 / 1 / 80 / 0', v_rows, v_fams, v_points, v_hidden;
  END IF;
  SELECT count(*) INTO v_ungrouped FROM public.badges WHERE family_key IN ('all:J5-6') AND ((rarity IS NULL) = (level IS NULL));
  IF v_ungrouped <> 0 THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 등급과 레벨이 둘 다 있거나 둘 다 없는 행이 % 개 있다', v_ungrouped;
  END IF;
  SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
  IF v_active <> 393 THEN
    RAISE EXCEPTION '291_seed_activity_badge_family_5_6.sql: 활성 액티비티 배지 수가 계획과 다르다: %개 — 기대값 393(= 390 + 3)', v_active;
  END IF;
END
$verify$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 검증 (적용 뒤 읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ① 새 행 3, 계열 1, 포인트 합 80, 숨김 0
--   SELECT count(*) AS 행수, count(DISTINCT family_key) AS 계열수, sum(point_reward) AS 포인트합, count(*) FILTER (WHERE is_hidden) AS 숨김 FROM public.badges WHERE family_key IN ('all:J5-6');
-- ② 가지별·종류별 행 수
--   SELECT branch_key, count(*) FILTER (WHERE rarity IS NOT NULL) AS 등급형, count(*) FILTER (WHERE level IS NOT NULL) AS 레벨형 FROM public.badges WHERE family_key IN ('all:J5-6') GROUP BY branch_key ORDER BY branch_key;
-- ③ 이미지가 비어 있는 새 행 (원본에 이미지가 없었다면 있을 수 있다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('all:J5-6') AND image_url IS NULL GROUP BY family_key ORDER BY family_key;
-- ④ 활동 배지 전체 수 = 적용 전 값 + 새 행 수
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
-- ⑤ 계열마다 단계 값이 오름차순인지(눈으로 확인)
--   SELECT family_key, rarity, level, condition_json FROM public.badges WHERE family_key IN ('all:J5-6') ORDER BY family_key, COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END);

-- 되돌림 SQL
-- 이번에 넣은 행을 family_key 목록으로 지운다. 먼저 받은 기록이 0건인지 확인한다(0이 아니면 아래 소프트 삭제를 쓴다):
-- SELECT count(*) FROM public.user_activity_badges WHERE badge_id IN (SELECT id FROM public.badges WHERE family_key IN ('all:J5-6'));
-- DELETE FROM public.badges WHERE family_key IN ('all:J5-6');
-- 받은 기록이 있어 지울 수 없으면 지우지 말고 끈다(받은 기록은 남는다):
-- UPDATE public.badges SET deleted_at = now() WHERE family_key IN ('all:J5-6') AND deleted_at IS NULL;
-- 이 파일은 새 칸·새 제약을 만들지 않으므로 그 밖에 되돌릴 객체는 없다.
