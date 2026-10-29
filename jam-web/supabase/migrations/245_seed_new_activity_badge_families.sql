-- 245_seed_new_activity_badge_families.sql
-- JAM 2.0 액티비티 배지: 새 계열 입력 (티켓 20261018_1816 3회, 상위 20261018_1811. 사용자 결정 3·4·5 = 2026-10-19 질문창 답)
--
-- 작성만 하고 실행하지 않았다. 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다. 새 칸·새 제약·새 함수는 없고 badges에 새 행만 넣는다(옛 행은 바꾸지 않는다).
-- 생성: jam-web/scripts/gen-new-activity-badge-families.mjs (원고 06 액티비티 배지.md 2·4·11절 + 재활용 후보 문서 2절). 손으로 고치지 말고 스크립트를 고쳐 다시 만든다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    넣는 행: 14계열 61행(활동 배지). 옛 프로덕션의 배지함·배지 트리·목록·어드민 배지 목록에 새 배지가 나타나고, 조건을 이미 채운 유저는
--    다음 판정(동기화·믹스·캡슐 열기·팔로우 등)에서 이 배지를 받는다(소급 발급은 따로 돌리지 않는다). 받으면 point_reward만큼 포인트가 지급된다.
--    옛 프로덕션 코드가 새 JAM! 지표 키(잼·캡슐·챕터 등)를 판정하는지는 이 파일에서 확인하지 않았다(판정 코드는 이 브랜치의 badge-engine에 있다). 판정하지 못하는 코드가 도는 동안에는 이 배지가 보이기만 하고 발급되지 않는다.
--
-- ⚠️ 적용 순서: 마이그레이션 244(재활용 후보 밖 활동 배지를 끄는 SQL)를 «먼저» 적용하고 이 파일을 «나중에» 적용한다.
--    244의 끄기 대상은 «type=activity이고 family_key가 유지 61계열 목록에 없는 배지 전부»라서, 이 파일의 새 행을 먼저 넣고 244를 돌리면 새 행이 전부 꺼진다.
--    244를 이미 적용했다면 문제없다. 244의 기대값(활성 634 → 270 등)은 이 파일을 넣기 «전» 숫자이므로 244의 드라이런·사후 검증도 이 파일 앞에서 돌린다.
--
-- 규칙
--   ① 넣는 계열(원고 번호): 6-1, 6-2, 7-1, 7-2, 8-1, 8-2, 8-3, 8-6, 8-7, 8-8, 8-9, 8-10, 8-11, 8-12 (14개 번호, family_key 14개).
--      원고 11절의 이름·설명·조건 표기를 그대로 쓴다. 등급형·구간 계열은 rarity(Common·Rare·Epic·Mystic), 레벨형은 level(1~)이고 등급(rarity)은 NULL이다(130 제약 badges_rarity_level_exclusive).
--   ② point_reward: 등급형 Common 10·Rare 20·Epic 50·Mystic 100, 레벨형은 레벨마다 10. 숨김은 이번에 넣는 계열에 없다(is_hidden 전부 false).
--   ③ condition_json: conditionRegistry.ts의 허용 키만 쓴다(CHECK badges_condition_json_known_keys 80개, 242). 걷기 계열은 activity_type=walking, JAM! 지표 계열은 activity_type 없이 지표 키 하나.
--      JAM! 지표 계열(원고 7·8갈래, 12계열)은 기존 JAM! 배지 관례대로 activity_types='{}' 이고 admin_category='jam' 이다(배지 화면의 JAM! 필터가 admin_category로 거른다).
--      7·8갈래의 판정은 엔진 밖 파이프라인이 한다(jamActionBadges.ts, usageBadges.ts). 메인 엔진은 이 키만 든 조건을 항상 fail 처리한다.
--   ④ family_key: 종목 계열은 `<종목>:J<원고 번호>`, JAM! 지표 계열은 `jam:J<원고 번호>`다. 기존 코드는 종목+영문 한 글자+숫자(walking:K1)였고 J는 쓰이지 않았다.
--      적용 전에 같은 family_key가 이미 있으면 아래 가드가 예외를 던져 전체를 되돌린다(기존 행을 건너뛰지 않는다. 되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다).
--   ⑤ branch_key: 243의 가지 일곱 중 하나(time_season·attribute·milestone·jam_activity). sort_order = 가지 번호×100 + 계열 번호(예: 6-1 → 601). 공개 기간(valid_from·valid_until)은 두지 않는다.
--   ⑥ image_url: 가장 가까운 기존 배지(재활용 후보)의 image_url을 복사한다(사용자 결정 4, 임시). 대응표는 아래. 원본 계열의 단계 수와 다르면 비례로 맞춘다(원본 n단, 새 m단이면 새 i번째는 원본 ceil(i×n/m)번째).
--      이미지 파일은 원본 배지와 같은 파일을 가리킨다(복사가 아니라 같은 주소). 어드민 이미지 생성기로 새 배지에 이미지를 만들면 이 주소가 바뀐다.
--      원본에 image_url이 없으면 새 행도 NULL이다(INSERT는 통과한다). 드라이런 ③으로 원본에 이미지가 있는지 먼저 본다.
--   ⑦ 트리거 badges_family_consistency(140·134): 등급형은 같은 family_key 안에서 측정 조건 키 집합이 같아야 한다. 이 파일의 등급형은 단계마다 같은 키 하나라 통과한다. 레벨형은 검사 대상이 아니다.
--   받은 기록·유저·포인트 원장·미션은 바꾸지 않는다.
--
-- 이번에 넣지 않는 계열: 사용자 결정 3의 12계열(1-4, 2-2, 3-4, 3-5, 5-1, 5-2, 5-4, 5-5, 8-4, 8-5, 7-3, 7-4)은 엔진 판정이 없어 후속 티켓에서 넣는다. 5-6은 원고에 이름·설명이 없다.
--   3-2도 이번 SQL에서 뺐다: 종목별 등급형인데 이름이 하나라, 엔진이 등급형을 이름으로 묶는 탓에 종목 사이에 상위 등급이 하위 등급을 막는다. 결정이 나면 스크립트에 --include-held를 주어 다시 만든다.
--
-- 이미지 대응표 (새 family_key → 이미지를 복사할 기존 family_key)
--   walking:J6-1             6-1   좌판 사이를 걸은 날    ← walking:K1 (4행 ← 원본 단계를 비례로 대응)
--   walking:J6-2             6-2   건조기가 멈춘 뒤에도 걸은 날 ← walking:P1 (4행 ← 원본 단계를 비례로 대응)
--   jam:J7-1                 7-1   노트가 쌓이는 빨래방    ← walking:K1 (5행 ← 원본 단계를 비례로 대응)
--   jam:J7-2                 7-2   부스에 쌓인 일주일     ← walking:P2 (4행 ← 원본 단계를 비례로 대응)
--   jam:J8-1                 8-1   봉투 속 한 장       ← walking:K3 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-2                 8-2   빌린 유리 칸        ← walking:P1 (4행 ← 원본 단계를 비례로 대응)
--   jam:J8-3                 8-3   창가 연구소 메모      ← walking:S1 (4행 ← 원본 단계를 비례로 대응)
--   jam:J8-6                 8-6   빨랫줄의 한 켤레      ← walking:K1 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-7                 8-7   엉뚱한 주제         ← walking:K3 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-8                 8-8   앨범에 붙는 한마디     ← walking:A8 (3행 ← 원본 단계를 비례로 대응)
--   jam:J8-9                 8-9   건너온 물건 칸       ← walking:K1 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-10                8-10  남의 가게에 흐른 곡    ← walking:A6 (3행 ← 원본 단계를 비례로 대응)
--   jam:J8-11                8-11  들썩이는 관중석       ← walking:K3 (5행 ← 원본 단계를 비례로 대응)
--   jam:J8-12                8-12  로봇 이야기 곁       ← walking:K1 (5행 ← 원본 단계를 비례로 대응)
--
-- 되돌림 방법과 사후 확인은 파일 끝에 있다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값: ① 0행 ② 0행 ③ 줄마다 이미지있음 = 행수(모자라면 그 계열을 원본으로 삼은 새 행의 image_url이 NULL이 된다) ④ 위반 0 ⑤ 적용 전 기준값
--
-- ① 같은 family_key가 이미 있는가 (0행이어야 한다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') GROUP BY family_key;
--
-- ② 같은 이름이 살아 있는 배지에 이미 있는가 (0행이어야 한다. 등급형은 같은 이름이 한 계열 안에서만 반복된다)
--   SELECT name, type, family_key FROM public.badges WHERE deleted_at IS NULL AND name IN ('좌판 사이를 걸은 날', '좌판 끝까지 걸은 날', '문방구 구석까지 걸은 날', '버스 2번 거리를 걸은 날', '건조기가 멈춘 뒤에도 걸은 날', '빨래 2판 동안 걸은 날', '빨래 3판 동안 걸은 날', '빨래방 한 저녁을 걸은 날', '노트가 쌓이는 빨래방', '부스에 쌓인 일주일', '봉투 속 한 장', '빌린 유리 칸', '창가 연구소 메모', '빨랫줄의 한 켤레', '엉뚱한 주제', '앨범에 붙는 한마디', '건너온 물건 칸', '남의 가게에 흐른 곡', '들썩이는 관중석', '로봇 이야기 곁');
--
-- ③ 이미지 원본: 계열마다 행 수와 image_url이 있는 행 수
--   SELECT family_key, count(*) AS 행수, count(image_url) AS 이미지있음 FROM public.badges WHERE family_key IN ('walking:K1', 'walking:P1', 'walking:P2', 'walking:K3', 'walking:S1', 'walking:A8', 'walking:A6') GROUP BY family_key ORDER BY family_key;
--
-- ④ 새 행의 condition_json이 허용 키 80개 CHECK를 통과하는지 (위반 행이 0이어야 한다. CHECK 식과 같은 식이다)
--   WITH allowed AS (SELECT array_agg(k) AS keys FROM unnest(ARRAY['distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours', 'total_count', 'streak_days', 'weekly_count', 'month', 'monthly_km', 'season_count', 'season_count_all', 'active_days_count', 'time_range', 'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m', 'avg_heartrate_bpm', 'avg_watts', 'avg_cadence', 'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days', 'daily_once_count', 'weekly_streak', 'distinct_time_bands', 'activities_within_hours', 'personal_record_break', 'month_over_month_ratio', 'vs_personal_average', 'repeat_count', 'cumulative_duration_hours', 'monthly_count', 'activity_type', 'day_of_week', 'prerequisite_badge_names', 'route', 'poi_id', 'season', 'same_activity', 'negative_split', 'day_of_month', 'cross_in_axis', 'cross_between_axis', 'gate_mission_badge', 'personal_record_break_metric', 'mission_reward', 'follower_count', 'following_count', 'daily_sync_count', 'daily_sync_streak_days', 'checkin_category_count', 'checkin_badge_count', 'combine_attempt_count', 'combine_success_count', 'combine_fail_count', 'recipe_first_success', 'drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count', 'mission_complete_count', 'collection_complete_count', 'days_since_signup', 'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days', 'capsule_open_count', 'locked_item_open_count', 'locked_item_pickup_count', 'other_tribe_item_kinds_count', 'cross_tribe_combine_success_count', 'jam_total_earned', 'jam_weekly_earned', 'chapter_reached']::text[]) AS k),
--   rows(label, condition_json) AS (VALUES
--     ('walking:J6-1/common', '{"activity_type":"walking","single_distance_km":5}'::jsonb),
--     ('walking:J6-1/rare', '{"activity_type":"walking","single_distance_km":7.5}'::jsonb),
--     ('walking:J6-1/epic', '{"activity_type":"walking","single_distance_km":10}'::jsonb),
--     ('walking:J6-1/mystic', '{"activity_type":"walking","single_distance_km":20}'::jsonb),
--     ('walking:J6-2/common', '{"activity_type":"walking","duration_minutes":60}'::jsonb),
--     ('walking:J6-2/rare', '{"activity_type":"walking","duration_minutes":90}'::jsonb),
--     ('walking:J6-2/epic', '{"activity_type":"walking","duration_minutes":120}'::jsonb),
--     ('walking:J6-2/mystic', '{"activity_type":"walking","duration_minutes":180}'::jsonb),
--     ('jam:J7-1/Lv1', '{"jam_total_earned":1100}'::jsonb),
--     ('jam:J7-1/Lv2', '{"jam_total_earned":5500}'::jsonb),
--     ('jam:J7-1/Lv3', '{"jam_total_earned":22000}'::jsonb),
--     ('jam:J7-1/Lv4', '{"jam_total_earned":55000}'::jsonb),
--     ('jam:J7-1/Lv5', '{"jam_total_earned":110000}'::jsonb),
--     ('jam:J7-2/common', '{"jam_weekly_earned":230}'::jsonb),
--     ('jam:J7-2/rare', '{"jam_weekly_earned":360}'::jsonb),
--     ('jam:J7-2/epic', '{"jam_weekly_earned":880}'::jsonb),
--     ('jam:J7-2/mystic', '{"jam_weekly_earned":1250}'::jsonb),
--     ('jam:J8-1/Lv1', '{"capsule_open_count":5}'::jsonb),
--     ('jam:J8-1/Lv2', '{"capsule_open_count":20}'::jsonb),
--     ('jam:J8-1/Lv3', '{"capsule_open_count":50}'::jsonb),
--     ('jam:J8-1/Lv4', '{"capsule_open_count":100}'::jsonb),
--     ('jam:J8-1/Lv5', '{"capsule_open_count":200}'::jsonb),
--     ('jam:J8-2/common', '{"locked_item_open_count":1}'::jsonb),
--     ('jam:J8-2/rare', '{"locked_item_open_count":10}'::jsonb),
--     ('jam:J8-2/epic', '{"locked_item_open_count":30}'::jsonb),
--     ('jam:J8-2/mystic', '{"locked_item_open_count":100}'::jsonb),
--     ('jam:J8-3/common', '{"combine_success_count":1}'::jsonb),
--     ('jam:J8-3/rare', '{"combine_success_count":5}'::jsonb),
--     ('jam:J8-3/epic', '{"combine_success_count":20}'::jsonb),
--     ('jam:J8-3/mystic', '{"combine_success_count":50}'::jsonb),
--     ('jam:J8-6/Lv1', '{"collection_complete_count":1}'::jsonb),
--     ('jam:J8-6/Lv2', '{"collection_complete_count":5}'::jsonb),
--     ('jam:J8-6/Lv3', '{"collection_complete_count":30}'::jsonb),
--     ('jam:J8-6/Lv4', '{"collection_complete_count":50}'::jsonb),
--     ('jam:J8-6/Lv5', '{"collection_complete_count":100}'::jsonb),
--     ('jam:J8-7/Lv1', '{"mission_complete_count":1}'::jsonb),
--     ('jam:J8-7/Lv2', '{"mission_complete_count":5}'::jsonb),
--     ('jam:J8-7/Lv3', '{"mission_complete_count":30}'::jsonb),
--     ('jam:J8-7/Lv4', '{"mission_complete_count":50}'::jsonb),
--     ('jam:J8-7/Lv5', '{"mission_complete_count":100}'::jsonb),
--     ('jam:J8-8/common', '{"chapter_reached":3}'::jsonb),
--     ('jam:J8-8/rare', '{"chapter_reached":5}'::jsonb),
--     ('jam:J8-8/epic', '{"chapter_reached":10}'::jsonb),
--     ('jam:J8-9/Lv1', '{"other_tribe_item_kinds_count":5}'::jsonb),
--     ('jam:J8-9/Lv2', '{"other_tribe_item_kinds_count":20}'::jsonb),
--     ('jam:J8-9/Lv3', '{"other_tribe_item_kinds_count":50}'::jsonb),
--     ('jam:J8-9/Lv4', '{"other_tribe_item_kinds_count":100}'::jsonb),
--     ('jam:J8-9/Lv5', '{"other_tribe_item_kinds_count":200}'::jsonb),
--     ('jam:J8-10/common', '{"cross_tribe_combine_success_count":1}'::jsonb),
--     ('jam:J8-10/rare', '{"cross_tribe_combine_success_count":3}'::jsonb),
--     ('jam:J8-10/epic', '{"cross_tribe_combine_success_count":10}'::jsonb),
--     ('jam:J8-11/Lv1', '{"follower_count":1}'::jsonb),
--     ('jam:J8-11/Lv2', '{"follower_count":5}'::jsonb),
--     ('jam:J8-11/Lv3', '{"follower_count":20}'::jsonb),
--     ('jam:J8-11/Lv4', '{"follower_count":50}'::jsonb),
--     ('jam:J8-11/Lv5', '{"follower_count":100}'::jsonb),
--     ('jam:J8-12/Lv1', '{"following_count":1}'::jsonb),
--     ('jam:J8-12/Lv2', '{"following_count":5}'::jsonb),
--     ('jam:J8-12/Lv3', '{"following_count":20}'::jsonb),
--     ('jam:J8-12/Lv4', '{"following_count":50}'::jsonb),
--     ('jam:J8-12/Lv5', '{"following_count":100}'::jsonb)
--   )
--   SELECT count(*) FILTER (WHERE r.condition_json - a.keys <> '{}'::jsonb) AS 위반, count(*) AS 전체 FROM rows r, allowed a;
--
-- ⑤ 현재 활동 배지 수(적용 전 기준값. 적용 뒤에는 이 값 + 새 행 수가 된다)
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
--
-- 롤백 실측: 아래 BEGIN 이후 본문(가드 DO 블록, INSERT, 사후 확인 DO 블록)을 한 트랜잭션으로 실행하고 COMMIT 대신 ROLLBACK 한다.
--   트랜잭션을 못 쓰는 도구(MCP)에서는 본문을 DO 블록 하나로 감싸 마지막에 RAISE EXCEPTION으로 되돌린다(CHECK·트리거·가드 통과를 실측한다).

BEGIN;

-- 가드: 같은 family_key가 이미 있으면 멈춘다 (되돌림 SQL이 family_key로 지우므로 남의 행이 섞이면 안 된다)
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12')) THEN
    RAISE EXCEPTION '245_seed_new_activity_badge_families.sql: 이미 같은 family_key를 가진 배지가 있다. 드라이런 ①로 확인한다';
  END IF;
END
$guard$;

-- 61행 입력 (14계열)
WITH new_rows (name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types, point_reward, branch_key, admin_category, src_family_key, pos, total) AS (
  VALUES
    ('좌판 사이를 걸은 날', '벼룩시장 좌판 사이를 수집가들이 지나갑니다. 단종된 시리즈가 문방구 구석에 있다고 해서 버스를 2번 갈아타고 왔습니다.', 'activity', 'common', NULL, 'walking:J6-1', 601, '{"activity_type":"walking","single_distance_km":5}'::jsonb, ARRAY['walking']::text[], 10, 'attribute', NULL, 'walking:K1', 1, 4),
    ('좌판 끝까지 걸은 날', '좌판 끝에서 수집가들이 빈손으로 돌아섰습니다. 그래도 칸에 세운 물건을 보면 다들 출처부터 묻습니다.', 'activity', 'rare', NULL, 'walking:J6-1', 601, '{"activity_type":"walking","single_distance_km":7.5}'::jsonb, ARRAY['walking']::text[], 20, 'attribute', NULL, 'walking:K1', 2, 4),
    ('문방구 구석까지 걸은 날', '소문의 출처는 문방구 구석 한 곳뿐이었습니다.', 'activity', 'epic', NULL, 'walking:J6-1', 601, '{"activity_type":"walking","single_distance_km":10}'::jsonb, ARRAY['walking']::text[], 50, 'attribute', NULL, 'walking:K1', 3, 4),
    ('버스 2번 거리를 걸은 날', '수집가는 좌판에서 건진 물건 하나를 칸에 세웁니다.', 'activity', 'mystic', NULL, 'walking:J6-1', 601, '{"activity_type":"walking","single_distance_km":20}'::jsonb, ARRAY['walking']::text[], 100, 'attribute', NULL, 'walking:K1', 4, 4),
    ('건조기가 멈춘 뒤에도 걸은 날', '빨래방이 붐비자 단골은 문을 열지 않고 골목으로 나갔습니다. 건조기 돌아가는 소리가 골목 끝까지 따라왔습니다.', 'activity', 'common', NULL, 'walking:J6-2', 602, '{"activity_type":"walking","duration_minutes":60}'::jsonb, ARRAY['walking']::text[], 10, 'attribute', NULL, 'walking:P1', 1, 4),
    ('빨래 2판 동안 걸은 날', '단골은 골목을 한 바퀴 더 돌았습니다. 돌아와 보니 건조기는 이미 멎어 있었습니다.', 'activity', 'rare', NULL, 'walking:J6-2', 602, '{"activity_type":"walking","duration_minutes":90}'::jsonb, ARRAY['walking']::text[], 20, 'attribute', NULL, 'walking:P1', 2, 4),
    ('빨래 3판 동안 걸은 날', '단골이 돌아왔을 때 건조기는 식어 있었습니다.', 'activity', 'epic', NULL, 'walking:J6-2', 602, '{"activity_type":"walking","duration_minutes":120}'::jsonb, ARRAY['walking']::text[], 50, 'attribute', NULL, 'walking:P1', 3, 4),
    ('빨래방 한 저녁을 걸은 날', '불이 켜진 빨래방은 이미 조용했습니다.', 'activity', 'mystic', NULL, 'walking:J6-2', 602, '{"activity_type":"walking","duration_minutes":180}'::jsonb, ARRAY['walking']::text[], 100, 'attribute', NULL, 'walking:P1', 4, 4),
    ('노트가 쌓이는 빨래방', '노트 한 권이 가득 찼습니다. 마지막 장은 접이식 테이블 위에 펼쳐져 있습니다.', 'activity', NULL, 1, 'jam:J7-1', 701, '{"jam_total_earned":1100}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:K1', 1, 5),
    ('노트가 쌓이는 빨래방', '새 노트가 접이식 테이블에 올라왔습니다. 진봉수는 첫 장부터 끝까지 읽습니다.', 'activity', NULL, 2, 'jam:J7-1', 701, '{"jam_total_earned":5500}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:K1', 2, 5),
    ('노트가 쌓이는 빨래방', '다 쓴 노트가 한쪽에 쌓였습니다. 진봉수는 한 권도 버리지 않습니다.', 'activity', NULL, 3, 'jam:J7-1', 701, '{"jam_total_earned":22000}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:K1', 3, 5),
    ('노트가 쌓이는 빨래방', '쌓인 노트가 접이식 테이블 밑으로 내려갔습니다.', 'activity', NULL, 4, 'jam:J7-1', 701, '{"jam_total_earned":55000}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:K1', 4, 5),
    ('노트가 쌓이는 빨래방', '다 쓴 노트는 한 손에 들리지 않습니다.', 'activity', NULL, 5, 'jam:J7-1', 701, '{"jam_total_earned":110000}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:K1', 5, 5),
    ('부스에 쌓인 일주일', '계단 밑 부스에 30초짜리 녹음이 들어왔습니다. 시장 뒤 창고의 일정한 칼질 소리입니다.', 'activity', 'common', NULL, 'jam:J7-2', 702, '{"jam_weekly_earned":230}'::jsonb, ARRAY[]::text[], 10, 'milestone', 'jam', 'walking:P2', 1, 4),
    ('부스에 쌓인 일주일', '칼질 소리 다음에는 뒷방의 박수가 이어집니다. 앰프 켜지는 소리가 그 사이에 끼었습니다.', 'activity', 'rare', NULL, 'jam:J7-2', 702, '{"jam_weekly_earned":360}'::jsonb, ARRAY[]::text[], 20, 'milestone', 'jam', 'walking:P2', 2, 4),
    ('부스에 쌓인 일주일', '칼질과 박수와 앰프 소리가 부스에 다 담겼습니다.', 'activity', 'epic', NULL, 'jam:J7-2', 702, '{"jam_weekly_earned":880}'::jsonb, ARRAY[]::text[], 50, 'milestone', 'jam', 'walking:P2', 3, 4),
    ('부스에 쌓인 일주일', '고양이 코 고는 소리가 부스에 남았습니다.', 'activity', 'mystic', NULL, 'jam:J7-2', 702, '{"jam_weekly_earned":1250}'::jsonb, ARRAY[]::text[], 100, 'milestone', 'jam', 'walking:P2', 4, 4),
    ('봉투 속 한 장', '반셔터 인화 봉투를 열면 맨 위에 사진이 올라 있습니다. 구석이 번졌는데 광호가 고른 한 장입니다.', 'activity', NULL, 1, 'jam:J8-1', 801, '{"capsule_open_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 1, 5),
    ('봉투 속 한 장', '봉투마다 손글씨로 이름이 적혀 있습니다.', 'activity', NULL, 2, 'jam:J8-1', 801, '{"capsule_open_count":20}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 2, 5),
    ('봉투 속 한 장', '손이 흔들린 사진이 맨 위에 올라온 봉투도 있습니다.', 'activity', NULL, 3, 'jam:J8-1', 801, '{"capsule_open_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 3, 5),
    ('봉투 속 한 장', '광호는 "이 장이 제일 좋아요" 하고 한 장씩 올려 둡니다.', 'activity', NULL, 4, 'jam:J8-1', 801, '{"capsule_open_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 4, 5),
    ('봉투 속 한 장', '광호가 봉투를 닫습니다.', 'activity', NULL, 5, 'jam:J8-1', 801, '{"capsule_open_count":200}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 5, 5),
    ('빌린 유리 칸', '유리 칸 하나를 빌렸습니다. 50년 된 가게에서 칸 열쇠를 꽂자 칸이 열렸습니다.', 'activity', 'common', NULL, 'jam:J8-2', 802, '{"locked_item_open_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:P1', 1, 4),
    ('빌린 유리 칸', '누군가의 세계가 칸마다 들어 있습니다. 같은 캐릭터의 열쇠고리 47개 앞에는 출처부터 묻는 사람이 몰렸습니다.', 'activity', 'rare', NULL, 'jam:J8-2', 802, '{"locked_item_open_count":10}'::jsonb, ARRAY[]::text[], 20, 'jam_activity', 'jam', 'walking:P1', 2, 4),
    ('빌린 유리 칸', '2000년대 초 인형 시리즈가 든 칸은 조명 각도를 주인이 직접 맞춰 둡니다.', 'activity', 'epic', NULL, 'jam:J8-2', 802, '{"locked_item_open_count":30}'::jsonb, ARRAY[]::text[], 50, 'jam_activity', 'jam', 'walking:P1', 3, 4),
    ('빌린 유리 칸', '칸 주인이 물건마다 출처를 댑니다.', 'activity', 'mystic', NULL, 'jam:J8-2', 802, '{"locked_item_open_count":100}'::jsonb, ARRAY[]::text[], 100, 'jam_activity', 'jam', 'walking:P1', 4, 4),
    ('창가 연구소 메모', '럭키마트 창가 조합 연구소에서 재료를 섞었습니다. 편의점 재료가 딱 맞아떨어졌습니다.', 'activity', 'common', NULL, 'jam:J8-3', 803, '{"combine_success_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:S1', 1, 4),
    ('창가 연구소 메모', '은박지를 펴서 메모에 한 줄 적었습니다.', 'activity', 'rare', NULL, 'jam:J8-3', 803, '{"combine_success_count":5}'::jsonb, ARRAY[]::text[], 20, 'jam_activity', 'jam', 'walking:S1', 2, 4),
    ('창가 연구소 메모', '창가에 앉고, 재료를 늘어놓고, 메모부터 폅니다.', 'activity', 'epic', NULL, 'jam:J8-3', 803, '{"combine_success_count":20}'::jsonb, ARRAY[]::text[], 50, 'jam_activity', 'jam', 'walking:S1', 3, 4),
    ('창가 연구소 메모', '창가에 은박지 메모가 붙어 있습니다.', 'activity', 'mystic', NULL, 'jam:J8-3', 803, '{"combine_success_count":50}'::jsonb, ARRAY[]::text[], 100, 'jam_activity', 'jam', 'walking:S1', 4, 4),
    ('빨랫줄의 한 켤레', '짝 잃은 양말이 제 짝을 찾아 빨랫줄에 나란히 걸렸습니다.', 'activity', NULL, 1, 'jam:J8-6', 806, '{"collection_complete_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 1, 5),
    ('빨랫줄의 한 켤레', '건조기에서 꺼낸 양말을 짝부터 맞춥니다.', 'activity', NULL, 2, 'jam:J8-6', 806, '{"collection_complete_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 2, 5),
    ('빨랫줄의 한 켤레', '분실물 바구니에서 짝이 하나 더 나왔습니다.', 'activity', NULL, 3, 'jam:J8-6', 806, '{"collection_complete_count":30}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 3, 5),
    ('빨랫줄의 한 켤레', '빨랫줄 한 줄이 켤레로 가득합니다.', 'activity', NULL, 4, 'jam:J8-6', 806, '{"collection_complete_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 4, 5),
    ('빨랫줄의 한 켤레', '분실물 바구니가 비었습니다.', 'activity', NULL, 5, 'jam:J8-6', 806, '{"collection_complete_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 5, 5),
    ('엉뚱한 주제', '백승리가 제비뽑기 통을 흔듭니다. 나온 주제는 붕어빵 틀로 만드는 요리였습니다.', 'activity', NULL, 1, 'jam:J8-7', 807, '{"mission_complete_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 1, 5),
    ('엉뚱한 주제', '마이크를 잡은 백승리가 "오늘의 대결!"이라고 외칩니다. 주제는 편의점 재료만으로 한 상 차리기였습니다.', 'activity', NULL, 2, 'jam:J8-7', 807, '{"mission_complete_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 2, 5),
    ('엉뚱한 주제', '대결이 끝나자 엔드롤로 몰려가 냄비를 나눕니다.', 'activity', NULL, 3, 'jam:J8-7', 807, '{"mission_complete_count":30}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 3, 5),
    ('엉뚱한 주제', '승리의 목소리는 시장 끝까지 들렸습니다.', 'activity', NULL, 4, 'jam:J8-7', 807, '{"mission_complete_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 4, 5),
    ('엉뚱한 주제', '승리가 쪽지를 펼치자 시장이 조용해집니다.', 'activity', NULL, 5, 'jam:J8-7', 807, '{"mission_complete_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 5, 5),
    ('앨범에 붙는 한마디', '계산대에서 은주는 앨범에 한마디를 붙입니다. 어느 곡부터 들으라는 말입니다.', 'activity', 'common', NULL, 'jam:J8-8', 808, '{"chapter_reached":3}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:A8', 1, 3),
    ('앨범에 붙는 한마디', '은주는 계산대에서 베이스 얘기도 꺼냅니다. "베이스는 잘 안 들리지만, 빠지면 다들 알아요."', 'activity', 'rare', NULL, 'jam:J8-8', 808, '{"chapter_reached":5}'::jsonb, ARRAY[]::text[], 20, 'jam_activity', 'jam', 'walking:A8', 2, 3),
    ('앨범에 붙는 한마디', '한마디를 들은 손님은 앨범을 들고 나갑니다.', 'activity', 'epic', NULL, 'jam:J8-8', 808, '{"chapter_reached":10}'::jsonb, ARRAY[]::text[], 50, 'jam_activity', 'jam', 'walking:A8', 3, 3),
    ('건너온 물건 칸', '반하은의 칸에 카세트가 꽂혀 있습니다. 찍어 낸 곳은 비사이드입니다.', 'activity', NULL, 1, 'jam:J8-9', 809, '{"other_tribe_item_kinds_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 1, 5),
    ('건너온 물건 칸', '비사이드는 카세트를 찍는 작은 레이블입니다. 새 카세트가 나오면 하은이 한 개씩 칸에 꽂습니다.', 'activity', NULL, 2, 'jam:J8-9', 809, '{"other_tribe_item_kinds_count":20}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 2, 5),
    ('건너온 물건 칸', '표지 글씨는 전부 하은이 썼습니다.', 'activity', NULL, 3, 'jam:J8-9', 809, '{"other_tribe_item_kinds_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 3, 5),
    ('건너온 물건 칸', '하은은 칸 이름표에 카세트가 나온 해를 적습니다.', 'activity', NULL, 4, 'jam:J8-9', 809, '{"other_tribe_item_kinds_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 4, 5),
    ('건너온 물건 칸', '하은이 새 카세트를 꽂을 틈을 비워 둡니다.', 'activity', NULL, 5, 'jam:J8-9', 809, '{"other_tribe_item_kinds_count":200}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 5, 5),
    ('남의 가게에 흐른 곡', '표하린이 음원으로 올린 노래가 카페 스피커로 흘러 나갑니다. 신경 쓰는 사람은 없습니다.', 'activity', 'common', NULL, 'jam:J8-10', 810, '{"cross_tribe_combine_success_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:A6', 1, 3),
    ('남의 가게에 흐른 곡', '편의점 스피커에서도 하린이 고른 노래가 흐릅니다. 소리는 배경에 깔려 있습니다.', 'activity', 'rare', NULL, 'jam:J8-10', 810, '{"cross_tribe_combine_success_count":3}'::jsonb, ARRAY[]::text[], 20, 'jam_activity', 'jam', 'walking:A6', 2, 3),
    ('남의 가게에 흐른 곡', '하린은 "아무도 안 쳐다봐요. 일이 잘 되고 있다는 뜻이에요."라고 말합니다.', 'activity', 'epic', NULL, 'jam:J8-10', 810, '{"cross_tribe_combine_success_count":10}'::jsonb, ARRAY[]::text[], 50, 'jam_activity', 'jam', 'walking:A6', 3, 3),
    ('들썩이는 관중석', '대결 무대 앞에서 곱빼기가 중계를 시작했습니다. 지나가던 이가 걸음을 멈췄습니다.', 'activity', NULL, 1, 'jam:J8-11', 811, '{"follower_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 1, 5),
    ('들썩이는 관중석', '곱빼기의 중계는 "자, 여기서 깍두기 투입합니다! 관중석이 들썩입니다!"로 시작합니다. 관중석으로 사람들이 하나둘 모입니다.', 'activity', NULL, 2, 'jam:J8-11', 811, '{"follower_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 2, 5),
    ('들썩이는 관중석', '깍두기 한 점에도 중계가 붙고 관중석이 들썩입니다. 무대 앞에 줄이 생깁니다.', 'activity', NULL, 3, 'jam:J8-11', 811, '{"follower_count":20}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 3, 5),
    ('들썩이는 관중석', '관중석이 가득 차서 무대 옆에도 사람이 섭니다.', 'activity', NULL, 4, 'jam:J8-11', 811, '{"follower_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 4, 5),
    ('들썩이는 관중석', '관중석 밖까지 사람이 서서 곱빼기의 중계를 듣습니다.', 'activity', NULL, 5, 'jam:J8-11', 811, '{"follower_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K3', 5, 5),
    ('로봇 이야기 곁', '교환회 돗자리 곁에 서서 이야기를 듣습니다. 탁영수가 1970년대부터 모은 양철 로봇의 출처를 댑니다.', 'activity', NULL, 1, 'jam:J8-12', 812, '{"following_count":1}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 1, 5),
    ('로봇 이야기 곁', '탁영수의 1번 칸 앞에 듣는 이들이 섰습니다. 이야기는 연도에서 시작합니다.', 'activity', NULL, 2, 'jam:J8-12', 812, '{"following_count":5}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 2, 5),
    ('로봇 이야기 곁', '탁영수는 양철 로봇마다 출처를 하나하나 짚습니다.', 'activity', NULL, 3, 'jam:J8-12', 812, '{"following_count":20}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 3, 5),
    ('로봇 이야기 곁', '태엽 감개를 꺼내 양철 로봇 60대를 고친 이야기를 합니다.', 'activity', NULL, 4, 'jam:J8-12', 812, '{"following_count":50}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 4, 5),
    ('로봇 이야기 곁', '탁영수가 1번 칸 조명을 끕니다.', 'activity', NULL, 5, 'jam:J8-12', 812, '{"following_count":100}'::jsonb, ARRAY[]::text[], 10, 'jam_activity', 'jam', 'walking:K1', 5, 5)
),
src AS (
  SELECT family_key AS src_family_key, image_url,
         row_number() OVER (PARTITION BY family_key ORDER BY COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END), id) AS rn,
         count(*) OVER (PARTITION BY family_key) AS n
    FROM public.badges
   WHERE family_key IN ('walking:K1', 'walking:P1', 'walking:P2', 'walking:K3', 'walking:S1', 'walking:A8', 'walking:A6')
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
    FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND deleted_at IS NULL;
  IF v_rows <> 61 OR v_fams <> 14 OR v_points <> 1410 OR v_hidden <> 0 THEN
    RAISE EXCEPTION '245_seed_new_activity_badge_families.sql: 사후 확인 실패 (행 %, 계열 %, 포인트 합 %, 숨김 %) — 기대값 61 / 14 / 1410 / 0', v_rows, v_fams, v_points, v_hidden;
  END IF;
  SELECT count(*) INTO v_ungrouped FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND ((rarity IS NULL) = (level IS NULL));
  IF v_ungrouped <> 0 THEN
    RAISE EXCEPTION '245_seed_new_activity_badge_families.sql: 등급과 레벨이 둘 다 있거나 둘 다 없는 행이 % 개 있다', v_ungrouped;
  END IF;
END
$verify$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 검증 (적용 뒤 읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ① 새 행 61, 계열 14, 포인트 합 1410, 숨김 0
--   SELECT count(*) AS 행수, count(DISTINCT family_key) AS 계열수, sum(point_reward) AS 포인트합, count(*) FILTER (WHERE is_hidden) AS 숨김 FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12');
-- ② 가지별·종류별 행 수
--   SELECT branch_key, count(*) FILTER (WHERE rarity IS NOT NULL) AS 등급형, count(*) FILTER (WHERE level IS NOT NULL) AS 레벨형 FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') GROUP BY branch_key ORDER BY branch_key;
-- ③ 이미지가 비어 있는 새 행 (원본에 이미지가 없었다면 있을 수 있다)
--   SELECT family_key, count(*) FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND image_url IS NULL GROUP BY family_key ORDER BY family_key;
-- ④ 활동 배지 전체 수 = 적용 전 값 + 새 행 수
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
-- ⑤ 계열마다 단계 값이 오름차순인지(눈으로 확인)
--   SELECT family_key, rarity, level, condition_json FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') ORDER BY family_key, COALESCE(level, CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'mystic' THEN 4 END);

-- 되돌림 SQL
-- 이번에 넣은 행을 family_key 목록으로 지운다. 먼저 받은 기록이 0건인지 확인한다(0이 아니면 아래 소프트 삭제를 쓴다):
-- SELECT count(*) FROM public.user_activity_badges WHERE badge_id IN (SELECT id FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12'));
-- DELETE FROM public.badges WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12');
-- 받은 기록이 있어 지울 수 없으면 지우지 말고 끈다(받은 기록은 남는다):
-- UPDATE public.badges SET deleted_at = now() WHERE family_key IN ('walking:J6-1', 'walking:J6-2', 'jam:J7-1', 'jam:J7-2', 'jam:J8-1', 'jam:J8-2', 'jam:J8-3', 'jam:J8-6', 'jam:J8-7', 'jam:J8-8', 'jam:J8-9', 'jam:J8-10', 'jam:J8-11', 'jam:J8-12') AND deleted_at IS NULL;
-- 이 파일은 새 칸·새 제약을 만들지 않으므로 그 밖에 되돌릴 객체는 없다.
