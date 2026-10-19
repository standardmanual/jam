-- 248_seed_held_activity_badge_families.sql
-- JAM 2.0 액티비티 배지: 보류했던 13계열 입력 (티켓 20261019_0542 3회, 상위 20261018_1811. 사용자 결정 1~6 = 2026-10-19 질문창 답)
--
-- 작성만 하고 실행하지 않았다. 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다. 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행과 245의 행은 바꾸지 않는다).
-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs --set held (원고 06 액티비티 배지.md 2·4·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    넣는 행: 17계열 59행(활동 배지, 등급형 13, 레벨형 3, 단일 1. 원고 번호 13개 — 3-2는 종목마다 계열 하나라 5계열). 옛 프로덕션의 배지함·배지 목록·어드민 배지 목록에 새 배지가 나타나고,
--    조건을 이미 채운 유저는 다음 판정(동기화·드랍 픽업·잼 정산 등)에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.
--    레벨형(5-1·8-4·8-5)은 이미 채운 유저가 첫 판정에서 채운 레벨까지 한꺼번에 받는다(레벨마다 10포인트). 등급형·단일은 채운 가장 높은 단계 하나만 받는다.
--    옛 프로덕션 코드가 이 파일의 새 조건 키 12개(246·247이 허용한 키)를 판정하는지는 이 파일에서 확인하지 않았다. 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.
--    그래서 공용 DB인 만큼 오픈 직전에 적용한다(판정 코드가 배포된 뒤).
--
-- ⚠️ 적용 순서: 244 → 245 → 248. 둘째 이후는 첫째가 끝난 뒤에 적용한다.
--    244(재활용 후보 밖 활동 배지를 끄는 SQL)의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 244보다 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.
--    245(14계열 61행)는 이 파일과 family_key가 겹치지 않아 순서가 데이터를 가르지는 않는다. 그래도 245를 먼저 적용한 뒤 이 파일을 적용한다(드라이런 ⑥으로 245가 들어갔는지 확인한다).
--    244·245의 드라이런·사후 검증 기대값(활성 634 → 270 등)은 이 파일을 넣기 «전» 숫자이므로 그 검증도 이 파일 앞에서 돌린다.
--    이 파일은 CHECK 제약을 새로 만들지 않는다. 허용 키 92개는 247까지 적용돼 있어야 한다(246: 86개, 247: 92개, 둘 다 적용 완료). 드라이런 ④가 같은 식으로 새 행을 미리 대조한다.
--
-- 규칙
--   ① 넣는 계열(원고 번호): 1-4, 2-2, 3-2, 3-4, 3-5, 5-1, 5-2, 5-4, 5-5, 7-3, 7-4, 8-4, 8-5 (13개 번호, family_key 17개). 5-6(원고에 이름·설명 없음)과 3-3(고쳐서 재활용, 기존 행 있음)은 넣지 않는다.
--      원고 11절의 이름·설명·조건 표기를 그대로 쓴다. 등급형은 rarity(Common·Rare·Epic), 레벨형은 level(1~)이고 등급(rarity)은 NULL이다(130 제약 badges_rarity_level_exclusive).
--      5-4(가입 뒤 첫 체크인 배지)는 단계 없는 단일이라 rarity=Common 한 행이다(원고 3-7 숨김 단일도 Common이다). 숨김 배지는 이 13계열에 없다(is_hidden 전부 false).
--   ② point_reward: 등급형 Common 10·Rare 20·Epic 50, 레벨형은 레벨마다 10, 단일(Common)은 10.
--   ③ condition_json: 단계 값 키 하나(+ 보조 키). 1-4 {active_week_streak:N, active_week_min_days:3}, 2-2 {return_streak_weeks:N}, 3-4 {full_week_count:N}, 3-5 {full_season_year_count:N},
--      5-1 {new_checkin_badge_count:N}(3·10·25·50·100), 5-2 {distinct_activity_type_count:N}, 5-4 {new_checkin_badge_count:1}, 5-5 {checkin_season_year_count:N},
--      7-3 {jam_week_count:N, jam_week_min_earned:200}, 7-4 {jam_week_streak:N, jam_week_min_earned:200}, 8-4 {dropped_item_picked_up_count:N}, 8-5 {pickup_item_count:N}(둘 다 1·5·30·50·100).
--      3-2는 종목마다 계열 하나({activity_type:<종목>, time_range:{start:18:00,end:22:00}, total_count:N}, 값은 원고 4절 종목별 보정: 걷기·러닝·자전거 1·5·20·50, 트레일러닝 1·4·16·40, 등산 1·3·12·30).
--      판정: 3-2는 메인 엔진(time_range + total_count, 시간대 안에서 활동한 «날»의 수로 센다), 나머지 12계열은 엔진 밖 파이프라인(jamActionBadges.ts)이 한다. 메인 엔진은 새 키만 든 조건을 항상 fail 처리한다.
--   ④ activity_types·admin_category·family_key: 3-2는 activity_types=[종목]·admin_category NULL·family_key `<종목>:J3-2`.
--      7·8갈래(7-3·7-4·8-4·8-5)는 245와 같은 JAM! 지표 관례다 — activity_types='{}'·admin_category='jam'·family_key `jam:J<번호>`.
--      그 밖의 합산 계열(1-4·2-2·3-4·3-5·5-1·5-2·5-4·5-5)은 종목이 없어 activity_types='{}'이고 admin_category는 NULL(JAM! 필터에 넣지 않는다)이며 family_key는 `all:J<번호>`다.
--      → 이 8계열은 배지 목록의 «전체»에는 나오지만 종목 필터에는 나오지 않고, 배지 트리(종목 첫 칸으로 묶는다)에는 나오지 않는다. 종목을 붙일지는 따로 정한다.
--      적용 전에 같은 family_key가 이미 있으면 아래 가드가 예외를 던져 전체를 되돌린다(기존 행을 건너뛰지 않는다. 되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).
--   ⑤ 이름: 같은 원고 번호 안에서만 이름이 겹친다(3-2의 종목별 5계열이 같은 이름). 엔진이 등급형을 이름이 아니라 family_key로 묶으므로(1회) 서로 막지 않는다. 번호가 다른 계열은 이름이 겹치지 않는다.
--   ⑥ branch_key: 243의 가지 일곱 중 하나(rhythm·recovery·time_season·explore·milestone·jam_activity). sort_order = 가지 번호×100 + 계열 번호(예: 1-4 → 104). 공개 기간(valid_from·valid_until)은 두지 않는다.
--   ⑦ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 계열의 단계 수와 다르면 비례로 맞춘다(원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째).
--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.
--      단일(5-4)은 1행이라 위 식이 원본의 «마지막 단계» 이미지를 고른다(원본 walking:A9 4행이면 4번째 행).
--   ⑧ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일의 등급형은 단계마다 같은 키 집합이라 통과한다. 레벨형은 검사 대상이 아니다.
--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.
--
-- 알려진 어긋남 (리뷰어·카리나가 알아야 한다)
--   a. 체크인 «처음 받은 줄»: 5-1·5-4·5-5의 판정(jamActionCheckinMetrics.ts)은 한 유저·한 체크인 배지의 줄 가운데 «활동 시각이 가장 이른 줄»을 새로 받은 배지로 센다.
--      `record_checkin_earn`(241)이 돌려주는 is_first는 «저장 순서로 처음 들어온 줄»이다. 늦게 동기화된 옛 활동이 나중에 기록되면 두 기준이 갈린다(활동 시각으로는 그 줄이 처음인데 is_first는 false).
--      그러면 체크인 배지 첫 획득 포인트(is_first 기준)와 이 파일의 5-x 배지 달성(활동 시각 기준)이 서로 다른 줄을 «처음»으로 본다. 이 파일이 넣는 행은 같고 판정할 때 세는 숫자만 갈린다.
--   b. 2-2: 원고 11절 조건 표기는 «14일 이상 휴식 후 매주 활동»인데 엔진 상수는 7일이다(사용자 결정 3, RETURN_REST_DAYS=7). condition_json에는 일수를 넣지 않으므로 DB 값은 같고,
--      화면의 조건 설명(conditionRegistry)은 7일로 나온다. 원고 문구를 7일로 고칠지 상수를 14일로 올릴지는 따로 정한다.
--   c. 8-4·8-5: 설명 문구는 «픽업 N회»지만 세는 방식은 서로 다른 아이템 수다(사용자 결정 2, 왕복 부풀림 방지).
--
-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)
--   all:J1-4                 1-4   카메라 좌판         ← walking:P2 (3행 ← 원본 단계를 비례로 대응)
--   all:J2-2                 2-2   뒷방 단골          ← walking:R4 (2행 ← 원본 단계를 비례로 대응)
--   walking:J3-2             3-2   남은 재료의 저녁      ← walking:A8 (4행 ← 원본 단계를 비례로 대응)
--   running:J3-2             3-2   남은 재료의 저녁      ← running:T1 (4행 ← 원본 단계를 비례로 대응)
--   trail_running:J3-2       3-2   남은 재료의 저녁      ← trail_running:T1 (4행 ← 원본 단계를 비례로 대응)
--   cycling:J3-2             3-2   남은 재료의 저녁      ← cycling:D1 (4행 ← 원본 단계를 비례로 대응)
--   hiking:J3-2              3-2   남은 재료의 저녁      ← hiking:D1 (4행 ← 원본 단계를 비례로 대응)
--   all:J3-4                 3-4   요일마다 닦은 칸      ← walking:S2 (3행 ← 원본 단계를 비례로 대응)
--   all:J3-5                 3-5   담벼락의 계절        ← walking:A6 (3행 ← 원본 단계를 비례로 대응)
--   all:J5-1                 5-1   처음 듣는 골목       ← walking:K3 (5행 ← 원본 단계를 비례로 대응)
--   all:J5-2                 5-2   붕어빵 틀로 한 판     ← walking:P1 (3행 ← 원본 단계를 비례로 대응)
--   all:J5-4                 5-4   벼룩시장 건너편       ← walking:A9 (1행 ← 원본 단계를 비례로 대응)
--   all:J5-5                 5-5   하늘빛이 다른 자리     ← walking:A8 (3행 ← 원본 단계를 비례로 대응)
--   jam:J7-3                 7-3   늘어 가는 서약서      ← walking:P2 (3행 ← 원본 단계를 비례로 대응)
--   jam:J7-4                 7-4   이어 붙인 쪽지       ← walking:S2 (3행 ← 원본 단계를 비례로 대응)
--   jam:J8-4                 8-4   바구니 속 한 짝      ← walking:K1 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-5                 8-5   입양 칸에서 온 물건    ← walking:K3 (5행 ← 원본 단계를 비례로 대응)
--
-- 되돌림 방법과 사후 확인은 파일 끝에 있다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값: ① 0행 ② 0행 ③ 줄마다 이미지있음 = 행수(모자라면 그 계열을 원본으로 삼은 새 행의 image_url이 NULL이 된다) ④ 위반 0 ⑤ 적용 전 기준값
--
-- ① 같은 family_key가 이미 있는가 (0행이어야 한다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') GROUP BY family_key;
--
-- ② 같은 이름이 살아 있는 배지에 이미 있는가 (0행이어야 한다. 등급형은 같은 이름이 한 계열 안에서만 반복된다)
--   SELECT name, type, family_key FROM public.badges WHERE deleted_at IS NULL AND name IN ('카메라 좌판', '뒷방 단골', '남은 재료의 저녁', '요일마다 닦은 칸', '담벼락의 계절', '처음 듣는 골목', '붕어빵 틀로 한 판', '벼룩시장 건너편', '하늘빛이 다른 자리', '늘어 가는 서약서', '이어 붙인 쪽지', '바구니 속 한 짝', '입양 칸에서 온 물건');
--
-- ③ 이미지 원본: 계열마다 행 수와 image_url이 있는 행 수
--   SELECT family_key, count(*) AS 행수, count(image_url) AS 이미지있음 FROM public.badges WHERE family_key IN ('walking:P2', 'walking:R4', 'walking:A8', 'running:T1', 'trail_running:T1', 'cycling:D1', 'hiking:D1', 'walking:S2', 'walking:A6', 'walking:K3', 'walking:P1', 'walking:A9', 'walking:K1') GROUP BY family_key ORDER BY family_key;
--
-- ④ 새 행의 condition_json이 허용 키 92개 CHECK를 통과하는지 (위반 행이 0이어야 한다. CHECK 식과 같은 식이다)
--   WITH allowed AS (SELECT array_agg(k) AS keys FROM unnest(ARRAY['distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours', 'total_count', 'streak_days', 'weekly_count', 'month', 'monthly_km', 'season_count', 'season_count_all', 'active_days_count', 'time_range', 'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m', 'avg_heartrate_bpm', 'avg_watts', 'avg_cadence', 'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days', 'daily_once_count', 'weekly_streak', 'distinct_time_bands', 'activities_within_hours', 'personal_record_break', 'month_over_month_ratio', 'vs_personal_average', 'repeat_count', 'cumulative_duration_hours', 'monthly_count', 'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route', 'poi_id', 'season', 'same_activity', 'negative_split', 'day_of_month', 'cross_in_axis', 'cross_between_axis', 'gate_mission_badge', 'personal_record_break_metric', 'mission_reward', 'follower_count', 'following_count', 'daily_sync_count', 'daily_sync_streak_days', 'checkin_category_count', 'checkin_badge_count', 'combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success', 'drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count', 'mission_complete_count', 'collection_complete_count', 'days_since_signup', 'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days', 'capsule_open_count', 'locked_item_open_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count', 'cross_tribe_combine_success_count', 'jam_total_earned', 'jam_weekly_earned', 'chapter_reached', 'active_week_streak', 'active_week_min_days', 'return_streak_weeks', 'full_week_count', 'full_season_year_count', 'distinct_activity_type_count', 'new_checkin_badge_count', 'checkin_season_year_count', 'dropped_item_picked_up_count', 'jam_week_count', 'jam_week_streak', 'jam_week_min_earned']::text[]) AS k),
--   rows(label, condition_json) AS (VALUES
--     ('all:J1-4/common', '{"active_week_streak":2,"active_week_min_days":3}'::jsonb),
--     ('all:J1-4/rare', '{"active_week_streak":3,"active_week_min_days":3}'::jsonb),
--     ('all:J1-4/epic', '{"active_week_streak":4,"active_week_min_days":3}'::jsonb),
--     ('all:J2-2/common', '{"return_streak_weeks":2}'::jsonb),
--     ('all:J2-2/rare', '{"return_streak_weeks":4}'::jsonb),
--     ('walking:J3-2/common', '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb),
--     ('walking:J3-2/rare', '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb),
--     ('walking:J3-2/epic', '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb),
--     ('walking:J3-2/mystic', '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb),
--     ('running:J3-2/common', '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb),
--     ('running:J3-2/rare', '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb),
--     ('running:J3-2/epic', '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb),
--     ('running:J3-2/mystic', '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb),
--     ('trail_running:J3-2/common', '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb),
--     ('trail_running:J3-2/rare', '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":4}'::jsonb),
--     ('trail_running:J3-2/epic', '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":16}'::jsonb),
--     ('trail_running:J3-2/mystic', '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":40}'::jsonb),
--     ('cycling:J3-2/common', '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb),
--     ('cycling:J3-2/rare', '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb),
--     ('cycling:J3-2/epic', '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb),
--     ('cycling:J3-2/mystic', '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb),
--     ('hiking:J3-2/common', '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb),
--     ('hiking:J3-2/rare', '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":3}'::jsonb),
--     ('hiking:J3-2/epic', '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":12}'::jsonb),
--     ('hiking:J3-2/mystic', '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":30}'::jsonb),
--     ('all:J3-4/common', '{"full_week_count":1}'::jsonb),
--     ('all:J3-4/rare', '{"full_week_count":3}'::jsonb),
--     ('all:J3-4/epic', '{"full_week_count":10}'::jsonb),
--     ('all:J3-5/common', '{"full_season_year_count":1}'::jsonb),
--     ('all:J3-5/rare', '{"full_season_year_count":3}'::jsonb),
--     ('all:J3-5/epic', '{"full_season_year_count":10}'::jsonb),
--     ('all:J5-1/Lv1', '{"new_checkin_badge_count":3}'::jsonb),
--     ('all:J5-1/Lv2', '{"new_checkin_badge_count":10}'::jsonb),
--     ('all:J5-1/Lv3', '{"new_checkin_badge_count":25}'::jsonb),
--     ('all:J5-1/Lv4', '{"new_checkin_badge_count":50}'::jsonb),
--     ('all:J5-1/Lv5', '{"new_checkin_badge_count":100}'::jsonb),
--     ('all:J5-2/common', '{"distinct_activity_type_count":2}'::jsonb),
--     ('all:J5-2/rare', '{"distinct_activity_type_count":3}'::jsonb),
--     ('all:J5-2/epic', '{"distinct_activity_type_count":5}'::jsonb),
--     ('all:J5-4/common', '{"new_checkin_badge_count":1}'::jsonb),
--     ('all:J5-5/common', '{"checkin_season_year_count":1}'::jsonb),
--     ('all:J5-5/rare', '{"checkin_season_year_count":3}'::jsonb),
--     ('all:J5-5/epic', '{"checkin_season_year_count":10}'::jsonb),
--     ('jam:J7-3/common', '{"jam_week_count":1,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J7-3/rare', '{"jam_week_count":5,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J7-3/epic', '{"jam_week_count":20,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J7-4/common', '{"jam_week_streak":2,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J7-4/rare', '{"jam_week_streak":3,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J7-4/epic', '{"jam_week_streak":4,"jam_week_min_earned":200}'::jsonb),
--     ('jam:J8-4/Lv1', '{"dropped_item_picked_up_count":1}'::jsonb),
--     ('jam:J8-4/Lv2', '{"dropped_item_picked_up_count":5}'::jsonb),
--     ('jam:J8-4/Lv3', '{"dropped_item_picked_up_count":30}'::jsonb),
--     ('jam:J8-4/Lv4', '{"dropped_item_picked_up_count":50}'::jsonb),
--     ('jam:J8-4/Lv5', '{"dropped_item_picked_up_count":100}'::jsonb),
--     ('jam:J8-5/Lv1', '{"pickup_item_count":1}'::jsonb),
--     ('jam:J8-5/Lv2', '{"pickup_item_count":5}'::jsonb),
--     ('jam:J8-5/Lv3', '{"pickup_item_count":30}'::jsonb),
--     ('jam:J8-5/Lv4', '{"pickup_item_count":50}'::jsonb),
--     ('jam:J8-5/Lv5', '{"pickup_item_count":100}'::jsonb)
--   )
--   SELECT count(*) FILTER (WHERE r.condition_json - a.keys <> '{}'::jsonb) AS 위반, count(*) AS 전체 FROM rows r, allowed a;
--
-- ⑤ 현재 활동 배지 수(적용 전 기준값. 적용 뒤에는 이 값 + 새 행 수가 된다)
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
--
-- ⑥ 245가 들어갔는가: 245의 14계열 61행이 있어야 한다(기대값 14 / 61. 아니면 245를 먼저 적용한다)
--   SELECT count(DISTINCT family_key) AS 계열수, count(*) AS 행수 FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND deleted_at IS NULL;
--
-- ⑦ 244가 들어갔는가: 활성 활동 배지 가운데 새 계열(`:J<번호>` 형식 family_key)이 아닌 것의 수는 244의 «유지 270행»만 남아 있어야 한다
--   (기대값 270. 244의 기대값과 같은 2026-10-10 조사 기준이라 그 뒤에 옛 형식 배지를 더했다면 달라질 수 있다).
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL AND (family_key IS NULL OR family_key !~ ':J[0-9]+-[0-9]+$');
--
-- 롤백 실측: 아래 BEGIN 이후 본문(가드 DO 블록, INSERT, 사후 확인 DO 블록)을 한 트랜잭션으로 실행하고 COMMIT 대신 ROLLBACK 한다.
--   트랜잭션을 못 쓰는 도구(MCP)에서는 본문을 DO 블록 하나로 감싸 마지막에 RAISE EXCEPTION으로 되돌린다(CHECK·트리거·가드 통과를 실측한다).

BEGIN;

-- 가드: 같은 family_key가 이미 있으면 멈춘다 (되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다)
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5')) THEN
    RAISE EXCEPTION '248_seed_held_activity_badge_families.sql: 이미 같은 family_key를 가진 배지가 있다. 드라이런 ①로 확인한다';
  END IF;
END
$guard$;

-- 59행 입력 (17계열)
WITH new_rows (name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types, point_reward, branch_key, admin_category, src_family_key, pos, total) AS (
  VALUES
    ('카메라 좌판', '구름다리 아래 곽진철의 좌판에는 고장 난 카메라도 놓여 있습니다. 버리지 않고 그대로 올립니다.', 'activity', 'common', NULL, 'all:J1-4', 104, '{"active_week_streak":2,"active_week_min_days":3}'::jsonb, ARRAY[]::text[], 10, 'rhythm', NULL, 'walking:P2', 1, 3),
    ('카메라 좌판', '짝이 맞지 않는 렌즈 캡도 좌판 한쪽을 차지합니다.', 'activity', 'rare', NULL, 'all:J1-4', 104, '{"active_week_streak":3,"active_week_min_days":3}'::jsonb, ARRAY[]::text[], 20, 'rhythm', NULL, 'walking:P2', 2, 3),
    ('카메라 좌판', '곽진철은 필름이 든 채 놓인 카메라를 열지 않습니다.', 'activity', 'epic', NULL, 'all:J1-4', 104, '{"active_week_streak":4,"active_week_min_days":3}'::jsonb, ARRAY[]::text[], 50, 'rhythm', NULL, 'walking:P2', 3, 3),
    ('뒷방 단골', '뒷방에서 드럼이 앞서 나가자 박수가 박자를 끌어내렸습니다. 12명이 서면 꽉 차는 방에 손등 도장이 가득했습니다.', 'activity', 'common', NULL, 'all:J2-2', 202, '{"return_streak_weeks":2}'::jsonb, ARRAY[]::text[], 10, 'recovery', NULL, 'walking:R4', 1, 2),
    ('뒷방 단골', '도장 찍힌 손들이 이번에는 첫 박부터 박수를 맞췄습니다.', 'activity', 'rare', NULL, 'all:J2-2', 202, '{"return_streak_weeks":4}'::jsonb, ARRAY[]::text[], 20, 'recovery', NULL, 'walking:R4', 2, 2),
    ('남은 재료의 저녁', '시장 셔터가 내려가자 엔드롤 문이 열렸습니다. 상자가 줄줄이 들어옵니다.', 'activity', 'common', NULL, 'walking:J3-2', 302, '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[], 10, 'time_season', NULL, 'walking:A8', 1, 4),
    ('남은 재료의 저녁', '남은 대파와 반쪽 두부가 상자에 담겨 왔습니다. 한소리가 냄비 앞에 섭니다.', 'activity', 'rare', NULL, 'walking:J3-2', 302, '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb, ARRAY['walking']::text[], 20, 'time_season', NULL, 'walking:A8', 2, 4),
    ('남은 재료의 저녁', '한소리가 대파와 두부를 한 냄비에 쏟습니다.', 'activity', 'epic', NULL, 'walking:J3-2', 302, '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb, ARRAY['walking']::text[], 50, 'time_season', NULL, 'walking:A8', 3, 4),
    ('남은 재료의 저녁', '재료가 떨어지자 엔드롤이 문을 닫습니다.', 'activity', 'mystic', NULL, 'walking:J3-2', 302, '{"activity_type":"walking","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[], 100, 'time_season', NULL, 'walking:A8', 4, 4),
    ('남은 재료의 저녁', '시장 셔터가 내려가자 엔드롤 문이 열렸습니다. 상자가 줄줄이 들어옵니다.', 'activity', 'common', NULL, 'running:J3-2', 302, '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb, ARRAY['running']::text[], 10, 'time_season', NULL, 'running:T1', 1, 4),
    ('남은 재료의 저녁', '남은 대파와 반쪽 두부가 상자에 담겨 왔습니다. 한소리가 냄비 앞에 섭니다.', 'activity', 'rare', NULL, 'running:J3-2', 302, '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb, ARRAY['running']::text[], 20, 'time_season', NULL, 'running:T1', 2, 4),
    ('남은 재료의 저녁', '한소리가 대파와 두부를 한 냄비에 쏟습니다.', 'activity', 'epic', NULL, 'running:J3-2', 302, '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb, ARRAY['running']::text[], 50, 'time_season', NULL, 'running:T1', 3, 4),
    ('남은 재료의 저녁', '재료가 떨어지자 엔드롤이 문을 닫습니다.', 'activity', 'mystic', NULL, 'running:J3-2', 302, '{"activity_type":"running","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb, ARRAY['running']::text[], 100, 'time_season', NULL, 'running:T1', 4, 4),
    ('남은 재료의 저녁', '시장 셔터가 내려가자 엔드롤 문이 열렸습니다. 상자가 줄줄이 들어옵니다.', 'activity', 'common', NULL, 'trail_running:J3-2', 302, '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb, ARRAY['trail_running']::text[], 10, 'time_season', NULL, 'trail_running:T1', 1, 4),
    ('남은 재료의 저녁', '남은 대파와 반쪽 두부가 상자에 담겨 왔습니다. 한소리가 냄비 앞에 섭니다.', 'activity', 'rare', NULL, 'trail_running:J3-2', 302, '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":4}'::jsonb, ARRAY['trail_running']::text[], 20, 'time_season', NULL, 'trail_running:T1', 2, 4),
    ('남은 재료의 저녁', '한소리가 대파와 두부를 한 냄비에 쏟습니다.', 'activity', 'epic', NULL, 'trail_running:J3-2', 302, '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":16}'::jsonb, ARRAY['trail_running']::text[], 50, 'time_season', NULL, 'trail_running:T1', 3, 4),
    ('남은 재료의 저녁', '재료가 떨어지자 엔드롤이 문을 닫습니다.', 'activity', 'mystic', NULL, 'trail_running:J3-2', 302, '{"activity_type":"trail_running","time_range":{"start":"18:00","end":"22:00"},"total_count":40}'::jsonb, ARRAY['trail_running']::text[], 100, 'time_season', NULL, 'trail_running:T1', 4, 4),
    ('남은 재료의 저녁', '시장 셔터가 내려가자 엔드롤 문이 열렸습니다. 상자가 줄줄이 들어옵니다.', 'activity', 'common', NULL, 'cycling:J3-2', 302, '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb, ARRAY['cycling']::text[], 10, 'time_season', NULL, 'cycling:D1', 1, 4),
    ('남은 재료의 저녁', '남은 대파와 반쪽 두부가 상자에 담겨 왔습니다. 한소리가 냄비 앞에 섭니다.', 'activity', 'rare', NULL, 'cycling:J3-2', 302, '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":5}'::jsonb, ARRAY['cycling']::text[], 20, 'time_season', NULL, 'cycling:D1', 2, 4),
    ('남은 재료의 저녁', '한소리가 대파와 두부를 한 냄비에 쏟습니다.', 'activity', 'epic', NULL, 'cycling:J3-2', 302, '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":20}'::jsonb, ARRAY['cycling']::text[], 50, 'time_season', NULL, 'cycling:D1', 3, 4),
    ('남은 재료의 저녁', '재료가 떨어지자 엔드롤이 문을 닫습니다.', 'activity', 'mystic', NULL, 'cycling:J3-2', 302, '{"activity_type":"cycling","time_range":{"start":"18:00","end":"22:00"},"total_count":50}'::jsonb, ARRAY['cycling']::text[], 100, 'time_season', NULL, 'cycling:D1', 4, 4),
    ('남은 재료의 저녁', '시장 셔터가 내려가자 엔드롤 문이 열렸습니다. 상자가 줄줄이 들어옵니다.', 'activity', 'common', NULL, 'hiking:J3-2', 302, '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":1}'::jsonb, ARRAY['hiking']::text[], 10, 'time_season', NULL, 'hiking:D1', 1, 4),
    ('남은 재료의 저녁', '남은 대파와 반쪽 두부가 상자에 담겨 왔습니다. 한소리가 냄비 앞에 섭니다.', 'activity', 'rare', NULL, 'hiking:J3-2', 302, '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":3}'::jsonb, ARRAY['hiking']::text[], 20, 'time_season', NULL, 'hiking:D1', 2, 4),
    ('남은 재료의 저녁', '한소리가 대파와 두부를 한 냄비에 쏟습니다.', 'activity', 'epic', NULL, 'hiking:J3-2', 302, '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":12}'::jsonb, ARRAY['hiking']::text[], 50, 'time_season', NULL, 'hiking:D1', 3, 4),
    ('남은 재료의 저녁', '재료가 떨어지자 엔드롤이 문을 닫습니다.', 'activity', 'mystic', NULL, 'hiking:J3-2', 302, '{"activity_type":"hiking","time_range":{"start":"18:00","end":"22:00"},"total_count":30}'::jsonb, ARRAY['hiking']::text[], 100, 'time_season', NULL, 'hiking:D1', 4, 4),
    ('요일마다 닦은 칸', '함수정이 유리 칸을 닦습니다. 칸 안에는 2000년대 초에 나온 인형 한 시리즈가 서 있습니다.', 'activity', 'common', NULL, 'all:J3-4', 304, '{"full_week_count":1}'::jsonb, ARRAY[]::text[], 10, 'time_season', NULL, 'walking:S2', 1, 3),
    ('요일마다 닦은 칸', '가게는 50년 전 함수정의 할머니가 열었습니다. 유리 칸 100개는 조명 각도까지 함수정의 손을 탔습니다.', 'activity', 'rare', NULL, 'all:J3-4', 304, '{"full_week_count":3}'::jsonb, ARRAY[]::text[], 20, 'time_season', NULL, 'walking:S2', 2, 3),
    ('요일마다 닦은 칸', '빌려주는 칸에도 함수정의 손이 닿습니다. 1970년대 양철 로봇이 선 칸을 닦고 나면 버스표 200장이 든 칸으로 넘어갑니다.', 'activity', 'epic', NULL, 'all:J3-4', 304, '{"full_week_count":10}'::jsonb, ARRAY[]::text[], 50, 'time_season', NULL, 'walking:S2', 3, 3),
    ('담벼락의 계절', '활판 골목 긴 담벼락에 동네 사람들의 사진이 걸립니다. 빨래집게 하나가 사진 한 장의 모서리를 물고 있습니다.', 'activity', 'common', NULL, 'all:J3-5', 305, '{"full_season_year_count":1}'::jsonb, ARRAY[]::text[], 10, 'time_season', NULL, 'walking:A6', 1, 3),
    ('담벼락의 계절', '빛이 한쪽으로만 들어온 사진이 담벼락 가운데에 걸려 있습니다.', 'activity', 'rare', NULL, 'all:J3-5', 305, '{"full_season_year_count":3}'::jsonb, ARRAY[]::text[], 20, 'time_season', NULL, 'walking:A6', 2, 3),
    ('담벼락의 계절', '접힌 사진 옆에 흐린 사진이 빨래집게에 물렸습니다.', 'activity', 'epic', NULL, 'all:J3-5', 305, '{"full_season_year_count":10}'::jsonb, ARRAY[]::text[], 50, 'time_season', NULL, 'walking:A6', 3, 3),
    ('처음 듣는 골목', '도란은 출근길을 다른 골목으로 정했습니다. 이어폰은 한쪽만 끼고 남은 귀는 동네에 맡깁니다.', 'activity', NULL, 1, 'all:J5-1', 501, '{"new_checkin_badge_count":3}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 1, 5),
    ('처음 듣는 골목', '수첩에는 동네마다 가게에서 흐르던 노래가 한 줄씩 적혀 있습니다.', 'activity', NULL, 2, 'all:J5-1', 501, '{"new_checkin_badge_count":10}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 2, 5),
    ('처음 듣는 골목', '골목이 바뀌면 한쪽 귀에 들어오는 소리도 달라집니다. 일정한 칼질 소리 앞에서는 걸음을 멈췄습니다.', 'activity', NULL, 3, 'all:J5-1', 501, '{"new_checkin_badge_count":25}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 3, 5),
    ('처음 듣는 골목', '출근길은 골목마다 다른 소리가 나는 길이 되었습니다.', 'activity', NULL, 4, 'all:J5-1', 501, '{"new_checkin_badge_count":50}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 4, 5),
    ('처음 듣는 골목', '수첩에는 골목의 이름과 소리가 함께 남아 있습니다.', 'activity', NULL, 5, 'all:J5-1', 501, '{"new_checkin_badge_count":100}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:K3', 5, 5),
    ('붕어빵 틀로 한 판', '대결 무대에 붕어빵 틀 요리가 주제로 걸렸습니다. 틀 하나에 숟가락이 우르르 몰려갔습니다.', 'activity', 'common', NULL, 'all:J5-2', 502, '{"distinct_activity_type_count":2}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:P1', 1, 3),
    ('붕어빵 틀로 한 판', '다음 주제는 편의점 재료였습니다. 진열대에서 집어 온 재료가 긴 테이블에 쏟아졌습니다.', 'activity', 'rare', NULL, 'all:J5-2', 502, '{"distinct_activity_type_count":3}'::jsonb, ARRAY[]::text[], 20, 'explore', NULL, 'walking:P1', 2, 3),
    ('붕어빵 틀로 한 판', '엉뚱한 주제가 나오자 다들 소매부터 걷습니다.', 'activity', 'epic', NULL, 'all:J5-2', 502, '{"distinct_activity_type_count":5}'::jsonb, ARRAY[]::text[], 50, 'explore', NULL, 'walking:P1', 3, 3),
    ('벼룩시장 건너편', '소나무 아래 가게에 유리 칸이 늘어서 있습니다. 처음 들어선 손님은 칸 100개의 손글씨 이름표를 하나씩 들여다봅니다.', 'activity', 'common', NULL, 'all:J5-4', 504, '{"new_checkin_badge_count":1}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:A9', 1, 1),
    ('하늘빛이 다른 자리', '활판 골목 담벼락에 하늘 사진이 나란히 걸렸습니다. 한 줄로 놓고 보니 하늘빛이 저마다 다릅니다.', 'activity', 'common', NULL, 'all:J5-5', 505, '{"checkin_season_year_count":1}'::jsonb, ARRAY[]::text[], 10, 'explore', NULL, 'walking:A8', 1, 3),
    ('하늘빛이 다른 자리', '담벼락 앞에서 사람들이 사진 속 하늘을 들여다봅니다. 구름이 한쪽으로 쏠린 사진도 빼지 않았습니다.', 'activity', 'rare', NULL, 'all:J5-5', 505, '{"checkin_season_year_count":3}'::jsonb, ARRAY[]::text[], 20, 'explore', NULL, 'walking:A8', 2, 3),
    ('하늘빛이 다른 자리', '하늘빛은 찍은 대로 담벼락에 걸려 있습니다.', 'activity', 'epic', NULL, 'all:J5-5', 505, '{"checkin_season_year_count":10}'::jsonb, ARRAY[]::text[], 50, 'explore', NULL, 'walking:A8', 3, 3),
    ('늘어 가는 서약서', '입양 칸의 물건에는 서약서가 따라옵니다. 교환회에서 주인을 못 찾은 물건에 서약서가 한 장 붙었습니다.', 'activity', 'common', NULL, 'jam:J7-3', 703, '{"jam_week_count":1,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:P2', 1, 3),
    ('늘어 가는 서약서', '서약서는 물건을 따라 건너갑니다. 교환회에서 입양 칸을 거친 물건은 서약서를 3장 단 채 새 주인에게 닿습니다.', 'activity', 'rare', NULL, 'jam:J7-3', 703, '{"jam_week_count":5,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 20, 'milestone', 'jam', 'walking:P2', 2, 3),
    ('늘어 가는 서약서', '50년 된 가게의 입양 칸에는 서약서가 겹겹이 붙어 있습니다.', 'activity', 'epic', NULL, 'jam:J7-3', 703, '{"jam_week_count":20,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 50, 'milestone', 'jam', 'walking:P2', 3, 3),
    ('이어 붙인 쪽지', '순자 할매의 쪽지가 오더북 뒤에 붙었습니다. 냄비 뚜껑에서 떼어 온 쪽지입니다.', 'activity', 'common', NULL, 'jam:J7-4', 704, '{"jam_week_streak":2,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:S2', 1, 3),
    ('이어 붙인 쪽지', '쪽지가 겹겹이 붙어 오더북 뒤가 두툼합니다. 소리는 한 장도 버리지 않습니다.', 'activity', 'rare', NULL, 'jam:J7-4', 704, '{"jam_week_streak":3,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 20, 'milestone', 'jam', 'walking:S2', 2, 3),
    ('이어 붙인 쪽지', '오더북 뒤는 순자 할매의 쪽지로 빈틈이 없습니다.', 'activity', 'epic', NULL, 'jam:J7-4', 704, '{"jam_week_streak":4,"jam_week_min_earned":200}'::jsonb, ARRAY[]::text[], 50, 'milestone', 'jam', 'walking:S2', 3, 3),
    ('바구니 속 한 짝', '분실물 바구니에 양말 한 짝을 두고 갔습니다. 돌아와 보니 누군가 짝을 맞춰 가져간 뒤였습니다.', 'activity', NULL, 1, 'jam:J8-4', 804, '{"dropped_item_picked_up_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 1, 5),
    ('바구니 속 한 짝', '양말 옆에 단추 하나도 두고 갔습니다.', 'activity', NULL, 2, 'jam:J8-4', 804, '{"dropped_item_picked_up_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 2, 5),
    ('바구니 속 한 짝', '양말이 빠진 바구니에 단추와 영수증이 남았습니다.', 'activity', NULL, 3, 'jam:J8-4', 804, '{"dropped_item_picked_up_count":30}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 3, 5),
    ('바구니 속 한 짝', '바구니가 조금 가벼워졌습니다.', 'activity', NULL, 4, 'jam:J8-4', 804, '{"dropped_item_picked_up_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 4, 5),
    ('바구니 속 한 짝', '다시 양말 한 짝을 둡니다.', 'activity', NULL, 5, 'jam:J8-4', 804, '{"dropped_item_picked_up_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 5, 5),
    ('입양 칸에서 온 물건', '주인을 못 찾은 물건은 입양 칸으로 갑니다. 교환회에서 남은 물건에 서약서가 한 장 더 붙어 다른 주인에게 건너갔습니다.', 'activity', NULL, 1, 'jam:J8-5', 805, '{"pickup_item_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 1, 5),
    ('입양 칸에서 온 물건', '서약서 첫 줄은 "평생 소중히 진열하겠습니다"입니다. 새 주인은 그 아래에 한 장을 더 붙입니다.', 'activity', NULL, 2, 'jam:J8-5', 805, '{"pickup_item_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 2, 5),
    ('입양 칸에서 온 물건', '입양 칸에서 물건 하나를 골라 데려왔습니다.', 'activity', NULL, 3, 'jam:J8-5', 805, '{"pickup_item_count":30}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 3, 5),
    ('입양 칸에서 온 물건', '새로 붙인 서약서에 이름을 적었습니다.', 'activity', NULL, 4, 'jam:J8-5', 805, '{"pickup_item_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 4, 5),
    ('입양 칸에서 온 물건', '내게 온 물건에는 서약서가 이어져 있습니다.', 'activity', NULL, 5, 'jam:J8-5', 805, '{"pickup_item_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 5, 5)
),
src AS (
  SELECT family_key AS src_family_key, image_url,
         row_number() OVER (PARTITION BY family_key ORDER BY COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END), id) AS rn,
         count(*) OVER (PARTITION BY family_key) AS n
    FROM public.badges
   WHERE family_key IN ('walking:P2', 'walking:R4', 'walking:A8', 'running:T1', 'trail_running:T1', 'cycling:D1', 'hiking:D1', 'walking:S2', 'walking:A6', 'walking:K3', 'walking:P1', 'walking:A9', 'walking:K1')
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
  v_rows int; v_fams int; v_points int; v_hidden int; v_ungrouped int;
BEGIN
  SELECT count(*), count(DISTINCT family_key), COALESCE(sum(point_reward), 0), count(*) FILTER (WHERE is_hidden)
    INTO v_rows, v_fams, v_points, v_hidden
    FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') AND deleted_at IS NULL;
  IF v_rows <> 59 OR v_fams <> 17 OR v_points <> 1650 OR v_hidden <> 0 THEN
    RAISE EXCEPTION '248_seed_held_activity_badge_families.sql: 사후 확인 실패 (행 %, 계열 %, 포인트 합 %, 숨김 %) — 기대값 59 / 17 / 1650 / 0', v_rows, v_fams, v_points, v_hidden;
  END IF;
  SELECT count(*) INTO v_ungrouped FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') AND ((rarity IS NULL) = (level IS NULL));
  IF v_ungrouped <> 0 THEN
    RAISE EXCEPTION '248_seed_held_activity_badge_families.sql: 등급과 레벨이 둘 다 있거나 둘 다 없는 행이 % 개 있다', v_ungrouped;
  END IF;
END
$verify$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 검증 (적용 뒤 읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ① 새 행 59, 계열 17, 포인트 합 1650, 숨김 0
--   SELECT count(*) AS 행수, count(DISTINCT family_key) AS 계열수, sum(point_reward) AS 포인트합, count(*) FILTER (WHERE is_hidden) AS 숨김 FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5');
-- ② 가지별·종류별 행 수
--   SELECT branch_key, count(*) FILTER (WHERE rarity IS NOT NULL) AS 등급형, count(*) FILTER (WHERE level IS NOT NULL) AS 레벨형 FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') GROUP BY branch_key ORDER BY branch_key;
-- ③ 이미지가 비어 있는 새 행 (원본에 이미지가 없었다면 있을 수 있다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') AND image_url IS NULL GROUP BY family_key ORDER BY family_key;
-- ④ 활동 배지 전체 수 = 적용 전 값 + 새 행 수
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
-- ⑤ 계열마다 단계 값이 오름차순인지(눈으로 확인)
--   SELECT family_key, rarity, level, condition_json FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') ORDER BY family_key, COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END);

-- 되돌림 SQL
-- 이번에 넣은 행을 family_key 목록으로 지운다. 먼저 받은 기록이 0건인지 확인한다(0이 아니면 아래 소프트 삭제를 쓴다):
-- SELECT count(*) FROM public.user_activity_badges WHERE badge_id IN (SELECT id FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5'));
-- DELETE FROM public.badges WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5');
-- 받은 기록이 있어 지울 수 없으면 지우지 말고 끈다(받은 기록은 남는다):
-- UPDATE public.badges SET deleted_at = now() WHERE family_key IN ('all:J1-4', 'all:J2-2', 'walking:J3-2', 'running:J3-2', 'trail_running:J3-2', 'cycling:J3-2', 'hiking:J3-2', 'all:J3-4', 'all:J3-5', 'all:J5-1', 'all:J5-2', 'all:J5-4', 'all:J5-5', 'jam:J7-3', 'jam:J7-4', 'jam:J8-4', 'jam:J8-5') AND deleted_at IS NULL;
-- 이 파일은 새 칸·새 제약을 만들지 않으므로 그 밖에 되돌릴 객체는 없다.
