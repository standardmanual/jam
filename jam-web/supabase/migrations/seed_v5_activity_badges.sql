-- seed_v5_activity_badges: v5 액티비티 배지 카탈로그 시딩 (티켓 20260905_0035 B1)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 B2에서 처리한다.
--
-- ⚠️ **선행 조건 — 구 207종 폐기가 먼저다.** 구 배지에도 family_key가 이미 채워져 있고
--    (`walking:밤의 보행자` 형태) v5 걷기가 같은 이름을 유지하는 계열이 5종 있다.
--    티켓 0034의 일괄 도구로 구 카탈로그를 먼저 폐기하지 않으면 시딩 직후 구·신이
--    한 성장 사다리로 합쳐진다 (티켓 0035 「실측 정정」 절).
--
-- ⚠️ 마이그레이션 130~134 실행이 선행 조건이다. 131이 CHECK 허용 키를 25→45종으로 넓히고
--    132·133이 4종을 더해 현재 49종이며, 134가 그 배열과 계열 정합성 트리거를 마지막으로 다시 썼다.
--
-- ⚠️ `image_url`을 컬럼 목록에서 뺐다 — v5 배지 이미지 630종은 아직 제작되지 않았다
--    (마스터 티켓 잔여 이슈). **이 630행이 image_url이 NULL인 첫 배지가 된다** —
--    2026-09-05 프로덕션 실측 결과 현재 image_url이 NULL인 배지는 0건이다. INSERT가
--    통과하는 근거는 「019_seed_worldview 선례」가 아니라 018에서 컬럼이 nullable로
--    바뀐 것이다 — 게이트 리뷰 실측으로 근거를 정정했다. 화면은 안전하다: SafeImage가
--    `if (!value || failed) return fallback`으로 null을 흡수하고 배지 경로가 전부 쓴다.
--    실행 전에 확인할 것:
--      SELECT is_nullable, column_default FROM information_schema.columns
--       WHERE table_name='badges' AND column_name='image_url';
--    NOT NULL이고 기본값이 없으면 이 INSERT는 첫 행에서 실패한다(데이터는 남지 않는다).
--
-- 생성: Service Plan/Specs/Content/v5_seed_build.py (재생성 가능 — 손으로 고치지 말 것)
-- 규모: 194계열 · 630종
--
-- 멱등: 같은 (family_key, rarity, level) 행이 이미 있으면 넣지 않는다. 두 번 돌려도 안전하다.
--
-- ── 표기 규약 ──────────────────────────────────────────────────────────────
--   [필터] 필터 키(time_range·month·day_of_week·season·day_of_month)를 측정 축과 함께 쓴다.
--          진행률 계산이 필터를 보지 않아 실제보다 후하게 나온다 (티켓 0035 「필터 키」 절).
--   [회차] repeat_count와 함께 쓴 키를 회차 술어가 소비하지 못한다 — 회차 0으로 fail-closed.
--          `collectRepeatOccurrences`의 CONSUMED_REPEAT_KEYS 확장이 필요하다.
--   [근사] 조건문 정본을 레지스트리 키로 정확히 옮길 수 없어 근사했다.

BEGIN;

INSERT INTO public.badges (
  name, description, type, rarity, level, family_key, sort_order,
  condition_json, activity_types, patch_available
)
SELECT v.name, v.description, v.type::badge_type, v.rarity::badge_rarity, v.level,
       v.family_key, v.sort_order, v.condition_json, v.activity_types, false
  FROM (VALUES
    -- walking:M1 · 누적의 증명 — 미션 '2주 안에 20km' 완료
    ('누적의 증명', '미션으로만 얻는 열쇠입니다. 누적 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M1', 1, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M2 · 리듬의 증명 — 미션 '3주(월~일) 연속 한 주에 3회' 완료
    ('리듬의 증명', '미션으로만 얻는 열쇠입니다. 주기 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M2', 2, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M3 · 시간의 증명 — 미션 '2주 안에 새벽·낮·밤 각 2회' 완료
    ('시간의 증명', '미션으로만 얻는 열쇠입니다. 시간대 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M3', 3, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M4 · 요일의 증명 — 미션 '2주 안에 서로 다른 5개 요일에 걷기' 완료
    ('요일의 증명', '미션으로만 얻는 열쇠입니다. 요일 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M4', 4, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M5 · 연속의 증명 — 미션 '7일 연속 걷기' 완료
    ('연속의 증명', '미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M5', 5, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M6 · 이정표의 증명 — 미션 '한 번에 8km 이상 걷기' 완료
    ('이정표의 증명', '미션으로만 얻는 열쇠입니다. 이정표 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M6', 6, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M7 · 회복의 증명 — 미션 '4주(월~일) 연속 한 주에 3회, 매주 1일 휴식' 완료
    ('회복의 증명', '미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M7', 7, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:M8 · 계절의 증명 — 미션 '서로 다른 두 달에 각각 30km 걷기' 완료
    ('계절의 증명', '미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'walking:M8', 8, '{"activity_type":"walking","mission_reward":true}'::jsonb, ARRAY['walking']::text[]),
    -- walking:K1 · 걸어온 거리 — 누적 거리 5km
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 1, 'walking:K1', 9, '{"activity_type":"walking","distance_km":5}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 2, 'walking:K1', 9, '{"activity_type":"walking","distance_km":15}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 3, 'walking:K1', 9, '{"activity_type":"walking","distance_km":40}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 4, 'walking:K1', 9, '{"activity_type":"walking","distance_km":75}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 5, 'walking:K1', 9, '{"activity_type":"walking","distance_km":130}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 6, 'walking:K1', 9, '{"activity_type":"walking","distance_km":210}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 7, 'walking:K1', 9, '{"activity_type":"walking","distance_km":330}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.', 'activity', NULL, 8, 'walking:K1', 9, '{"activity_type":"walking","distance_km":550}'::jsonb, ARRAY['walking']::text[]),
    -- walking:K3 · 걸은 날들 — 누적 활동일수 3일
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 1, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 2, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 3, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":22}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 4, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":40}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 5, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":70}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 6, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":110}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P1 · 오늘의 한 걸음 — 하루 1회 / 1회
    ('오늘의 한 걸음', '하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.', 'activity', 'common', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.', 'activity', 'rare', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.', 'activity', 'epic', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":100}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.', 'activity', 'mystic', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":300}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P2 · 이번 주의 약속 — 한 주(월~일)에 3회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 약속', '스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.', 'activity', 'common', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.', 'activity', 'rare', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.', 'activity', 'epic', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":26}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.', 'activity', 'mystic', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P3 · 이달의 걸음 — 한 달에 30km
    ('이달의 걸음', '한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.', 'activity', 'common', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":30}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.', 'activity', 'rare', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":52}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.', 'activity', 'epic', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":85}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.', 'activity', 'mystic', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":130}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P4 · 계절의 보행자 — 한 계절에 100km
    --   [필터] season + distance_km
    ('계절의 보행자', '계절 하나를 걸어서 통과했습니다.', 'activity', 'common', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":100}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '계절 하나를 걸어서 통과했습니다.', 'activity', 'rare', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":156}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '계절 하나를 걸어서 통과했습니다.', 'activity', 'epic', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":250}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '계절 하나를 걸어서 통과했습니다.', 'activity', 'mystic', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":400}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A1 · 자정의 경계인 — 자정을 넘긴 활동 / 1회
    --   [필터] time_range + total_count
    --   [근사] 「자정을 넘긴 활동」은 시작 시각 범위로만 근사할 수 있다 (23:00~01:00)
    ('자정의 경계인', '하루와 하루 사이를 걸어서 넘어간 사람입니다.', 'activity', 'common', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '하루와 하루 사이를 걸어서 넘어간 사람입니다.', 'activity', 'rare', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '하루와 하루 사이를 걸어서 넘어간 사람입니다.', 'activity', 'epic', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '하루와 하루 사이를 걸어서 넘어간 사람입니다.', 'activity', 'mystic', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A2 · 해와 달 사이 — 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회
    --   [필터] time_range + total_count
    --   [근사] 「같은 날 아침 이전 + 저녁 이후 각 1회」를 20:00~08:00 한 구간으로 근사
    ('해와 달 사이', '같은 하루의 양 끝을 모두 밟았습니다.', 'activity', 'rare', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('해와 달 사이', '같은 하루의 양 끝을 모두 밟았습니다.', 'activity', 'epic', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('해와 달 사이', '같은 하루의 양 끝을 모두 밟았습니다.', 'activity', 'mystic', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":25}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A3 · 리듬 브레이커 — 3일 연속 서로 다른 시간대 / 1회
    --   [회차] 미소비 키 distinct_time_bands·streak_days
    ('리듬 브레이커', '몸에 밴 시간대를 사흘 내리 흔들었습니다.', 'activity', 'rare', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('리듬 브레이커', '몸에 밴 시간대를 사흘 내리 흔들었습니다.', 'activity', 'epic', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('리듬 브레이커', '몸에 밴 시간대를 사흘 내리 흔들었습니다.', 'activity', 'mystic', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A4 · 스물넷의 산책 — 24시간 안에 3회 / 1회
    --   [회차] 미소비 키 activities_within_hours
    ('스물넷의 산책', '하루가 세 번의 산책을 견뎠습니다.', 'activity', 'rare', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('스물넷의 산책', '하루가 세 번의 산책을 견뎠습니다.', 'activity', 'epic', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":4}'::jsonb, ARRAY['walking']::text[]),
    ('스물넷의 산책', '하루가 세 번의 산책을 견뎠습니다.', 'activity', 'mystic', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A5 · 주말이 없다 — 4주(월~일) 연속 평일만 / 1회
    --   [회차] 미소비 키 weekly_streak
    --   [근사] 「토·일 0회」(부정 조건)를 표현할 수 없다 — 평일 요일 목록 + 연속 주로 근사
    ('주말이 없다', '쉬는 날에도 평일의 리듬을 지켰습니다.', 'activity', 'rare', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('주말이 없다', '쉬는 날에도 평일의 리듬을 지켰습니다.', 'activity', 'epic', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('주말이 없다', '쉬는 날에도 평일의 리듬을 지켰습니다.', 'activity', 'mystic', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A6 · 초하루의 사람 — 매달 1일 / 1회
    --   [필터] day_of_month + total_count
    ('초하루의 사람', '달이 바뀌는 첫날마다 신발을 신었습니다.', 'activity', 'rare', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('초하루의 사람', '달이 바뀌는 첫날마다 신발을 신었습니다.', 'activity', 'epic', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('초하루의 사람', '달이 바뀌는 첫날마다 신발을 신었습니다.', 'activity', 'mystic', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A8 · 새벽의 사람 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 사람', '아무도 깨지 않은 시간을 혼자 씁니다.', 'activity', 'rare', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('새벽의 사람', '아무도 깨지 않은 시간을 혼자 씁니다.', 'activity', 'epic', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('새벽의 사람', '아무도 깨지 않은 시간을 혼자 씁니다.', 'activity', 'mystic', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":60}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A9 · 밤의 보행자 — 밤 10시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 보행자', '밤 10시가 넘은 골목에도 걷는 사람이 있습니다.', 'activity', 'common', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '밤 10시가 넘은 골목에도 걷는 사람이 있습니다.', 'activity', 'rare', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":15}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '밤 10시가 넘은 골목에도 걷는 사람이 있습니다.', 'activity', 'epic', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '밤 10시가 넘은 골목에도 걷는 사람이 있습니다.', 'activity', 'mystic', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":120}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A10 · 점심의 탈출 — 낮 12시~2시 / 1회
    --   [필터] time_range + total_count
    ('점심의 탈출', '가장 짧은 자유 시간을 걸음에 씁니다.', 'activity', 'common', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '가장 짧은 자유 시간을 걸음에 씁니다.', 'activity', 'rare', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":15}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '가장 짧은 자유 시간을 걸음에 씁니다.', 'activity', 'epic', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '가장 짧은 자유 시간을 걸음에 씁니다.', 'activity', 'mystic', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":120}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D0 · 일요일의 의식 — 일요일 / 1회
    --   [필터] day_of_week + total_count
    ('일요일의 의식', '한 주의 끝을 걸음으로 닫습니다.', 'activity', 'common', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '한 주의 끝을 걸음으로 닫습니다.', 'activity', 'rare', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '한 주의 끝을 걸음으로 닫습니다.', 'activity', 'epic', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '한 주의 끝을 걸음으로 닫습니다.', 'activity', 'mystic', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D1 · 월요병 극복자 — 월요일 / 1회
    --   [필터] day_of_week + total_count
    ('월요병 극복자', '가장 무거운 요일을 걸어서 넘깁니다.', 'activity', 'common', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '가장 무거운 요일을 걸어서 넘깁니다.', 'activity', 'rare', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '가장 무거운 요일을 걸어서 넘깁니다.', 'activity', 'epic', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '가장 무거운 요일을 걸어서 넘깁니다.', 'activity', 'mystic', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D2 · 불금은 없다 — 금요일 / 1회
    --   [필터] day_of_week + total_count
    ('불금은 없다', '금요일 밤의 유혹보다 걸음을 골랐습니다.', 'activity', 'common', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '금요일 밤의 유혹보다 걸음을 골랐습니다.', 'activity', 'rare', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '금요일 밤의 유혹보다 걸음을 골랐습니다.', 'activity', 'epic', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '금요일 밤의 유혹보다 걸음을 골랐습니다.', 'activity', 'mystic', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D3 · 주 5일 완주 — 한 주(월~일)에 평일 5일 모두 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「한 주에 평일 5일 모두」를 요일별 독립 카운터(day_of_week 배열 + total_count)로 근사
    ('주 5일 완주', '평일 다섯 날을 하나도 빠뜨리지 않았습니다.', 'activity', 'rare', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('주 5일 완주', '평일 다섯 날을 하나도 빠뜨리지 않았습니다.', 'activity', 'epic', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('주 5일 완주', '평일 다섯 날을 하나도 빠뜨리지 않았습니다.', 'activity', 'mystic', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S1 · 작심삼일의 파괴자 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('작심삼일의 파괴자', '사흘째가 가장 어렵다는 말을 스스로 반박했습니다.', 'activity', 'common', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '사흘째가 가장 어렵다는 말을 스스로 반박했습니다.', 'activity', 'rare', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '사흘째가 가장 어렵다는 말을 스스로 반박했습니다.', 'activity', 'epic', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '사흘째가 가장 어렵다는 말을 스스로 반박했습니다.', 'activity', 'mystic', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S2 · 열흘의 리듬 — 10일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('열흘의 리듬', '열흘이면 습관이라 불러도 됩니다.', 'activity', 'rare', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('열흘의 리듬', '열흘이면 습관이라 불러도 됩니다.', 'activity', 'epic', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('열흘의 리듬', '열흘이면 습관이라 불러도 됩니다.', 'activity', 'mystic', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S3 · 한 달의 궤도 — 30일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('한 달의 궤도', '한 달을 하루도 끊지 않았습니다.', 'activity', 'epic', NULL, 'walking:S3', 30, '{"activity_type":"walking","streak_days":30,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한 달의 궤도', '한 달을 하루도 끊지 않았습니다.', 'activity', 'mystic', NULL, 'walking:S3', 30, '{"activity_type":"walking","streak_days":30,"repeat_count":2}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B1 · 자기 초월 — 가장 긴 거리 갱신
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 2, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 3, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 4, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 5, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 6, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 7, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 8, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B2 · 더 오래 — 가장 긴 이동시간 갱신
    --   [근사] 「최장 이동시간 갱신」과 「최장 거리 갱신」(B1)을 구분할 지표 지정 수단이 없다
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 1, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 2, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 3, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 4, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 5, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 6, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 7, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 8, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B3 · 지난달의 나에게 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 2, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 3, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 4, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 5, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 6, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 7, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 8, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B4 · 평균의 배신 — 한 번에 평소 평균 거리의 2배 이상
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 1, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 2, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 3, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 4, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 5, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 6, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 7, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 8, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:C1 · 100km 클럽 — 누적 거리 100km
    ('100km 클럽', '세 자리 숫자에 처음 닿았습니다.', 'activity', 'rare', NULL, 'walking:C1', 35, '{"activity_type":"walking","distance_km":100}'::jsonb, ARRAY['walking']::text[]),
    -- walking:C2 · 500km 클럽 — 누적 거리 500km
    ('500km 클럽', '지도 위의 선이 도시를 벗어났습니다.', 'activity', 'epic', NULL, 'walking:C2', 36, '{"activity_type":"walking","distance_km":500}'::jsonb, ARRAY['walking']::text[]),
    -- walking:C3 · 1000km 클럽 — 누적 거리 1,000km
    ('1000km 클럽', '네 자리 숫자를 걸어서 만들었습니다.', 'activity', 'mystic', NULL, 'walking:C3', 37, '{"activity_type":"walking","distance_km":1000}'::jsonb, ARRAY['walking']::text[]),
    -- walking:C4 · 백 번의 걸음 — 총 100회
    ('백 번의 걸음', '백 번을 나섰다는 사실만으로 충분합니다.', 'activity', 'rare', NULL, 'walking:C4', 38, '{"activity_type":"walking","total_count":100}'::jsonb, ARRAY['walking']::text[]),
    -- walking:C5 · 분실물 센터 999 — 총 999회
    ('분실물 센터 999', '분실물 센터 999도 이 숫자는 처음 접수합니다.', 'activity', 'mystic', NULL, 'walking:C5', 39, '{"activity_type":"walking","total_count":999}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R1 · 완전한 하루 — 6일 연속 후 하루 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_streak)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_streak·streak_days
    ('완전한 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'rare', NULL, 'walking:R1', 40, '{"activity_type":"walking","streak_days":6,"rest_after_streak":1,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('완전한 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'epic', NULL, 'walking:R1', 40, '{"activity_type":"walking","streak_days":6,"rest_after_streak":1,"repeat_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('완전한 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'mystic', NULL, 'walking:R1', 40, '{"activity_type":"walking","streak_days":6,"rest_after_streak":1,"repeat_count":20}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R2 · 회복의 기술 — 한 번에 90분 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long
    --   [근사] 「90분 이상 활동 다음 날 휴식」 — rest_after_long의 짝 필드가 single_distance_km 하나뿐이라 duration_minutes와 짝지을 수 없다
    ('회복의 기술', '길게 걸은 다음 날을 비워두는 법을 압니다.', 'activity', 'common', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '길게 걸은 다음 날을 비워두는 법을 압니다.', 'activity', 'rare', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '길게 걸은 다음 날을 비워두는 법을 압니다.', 'activity', 'epic', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '길게 걸은 다음 날을 비워두는 법을 압니다.', 'activity', 'mystic', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":100}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R3 · 쉬는 것도 훈련 — 4주(월~일) 연속 매주 1일 이상 휴식 / 1회
    --   [회차] 미소비 키 weekly_streak
    --   [근사] 「매주 하루 이상 휴식」을 표현할 수 없다 — 연속 주(weekly_streak)로만 근사
    ('쉬는 것도 훈련', '네 주 동안 쉬는 날을 한 번도 건너뛰지 않았습니다.', 'activity', 'rare', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('쉬는 것도 훈련', '네 주 동안 쉬는 날을 한 번도 건너뛰지 않았습니다.', 'activity', 'epic', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('쉬는 것도 훈련', '네 주 동안 쉬는 날을 한 번도 건너뛰지 않았습니다.', 'activity', 'mystic', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R4 · 겨울잠 — 14일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('겨울잠', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('겨울잠', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'rare', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('겨울잠', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'epic', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W1 · 한여름의 보행자 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 보행자', '가장 더운 두 달에도 걸음을 멈추지 않았습니다.', 'activity', 'common', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '가장 더운 두 달에도 걸음을 멈추지 않았습니다.', 'activity', 'rare', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '가장 더운 두 달에도 걸음을 멈추지 않았습니다.', 'activity', 'epic', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '가장 더운 두 달에도 걸음을 멈추지 않았습니다.', 'activity', 'mystic', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W2 · 한겨울의 보행자 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 보행자', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'rare', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한겨울의 보행자', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'epic', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('한겨울의 보행자', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'mystic', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":60}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W3 · 사계절의 발걸음 — 네 계절 각 10회 / 1회
    ('사계절의 발걸음', '일 년을 네 조각으로 나눠 모두 걸었습니다.', 'activity', 'epic', NULL, 'walking:W3', 46, '{"activity_type":"walking","season_count_all":10}'::jsonb, ARRAY['walking']::text[]),
    ('사계절의 발걸음', '일 년을 네 조각으로 나눠 모두 걸었습니다.', 'activity', 'mystic', NULL, 'walking:W3', 46, '{"activity_type":"walking","season_count_all":20}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W4 · 장마의 의지 — 6~7월 중 한 달에 80km
    --   [필터] month + monthly_km
    --   [회차] 미소비 키 month·monthly_km
    ('장마의 의지', '빗소리를 배경음으로 한 달을 채웠습니다.', 'activity', 'epic', NULL, 'walking:W4', 47, '{"activity_type":"walking","month":[6,7],"monthly_km":80,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('장마의 의지', '빗소리를 배경음으로 한 달을 채웠습니다.', 'activity', 'mystic', NULL, 'walking:W4', 47, '{"activity_type":"walking","month":[6,7],"monthly_km":80,"repeat_count":2}'::jsonb, ARRAY['walking']::text[]),
    -- running:K1 · 달려온 거리 — 누적 거리 20km
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 1, 'running:K1', 1, '{"activity_type":"running","distance_km":20}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 2, 'running:K1', 1, '{"activity_type":"running","distance_km":60}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 3, 'running:K1', 1, '{"activity_type":"running","distance_km":150}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 4, 'running:K1', 1, '{"activity_type":"running","distance_km":320}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 5, 'running:K1', 1, '{"activity_type":"running","distance_km":600}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 6, 'running:K1', 1, '{"activity_type":"running","distance_km":1100}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 7, 'running:K1', 1, '{"activity_type":"running","distance_km":1900}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 8, 'running:K1', 1, '{"activity_type":"running","distance_km":3200}'::jsonb, ARRAY['running']::text[]),
    -- running:K3 · 달린 횟수 — 총 10회
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 1, 'running:K3', 2, '{"activity_type":"running","total_count":10}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 2, 'running:K3', 2, '{"activity_type":"running","total_count":30}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 3, 'running:K3', 2, '{"activity_type":"running","total_count":60}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 4, 'running:K3', 2, '{"activity_type":"running","total_count":110}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 5, 'running:K3', 2, '{"activity_type":"running","total_count":190}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 6, 'running:K3', 2, '{"activity_type":"running","total_count":320}'::jsonb, ARRAY['running']::text[]),
    -- running:P1 · 페이스 메이커 — 한 번에 5km 이상, 6:15/km보다 빠르게
    ('페이스 메이커', '속도는 재능이 아니라 반복이 만든 결과입니다.', 'activity', 'common', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":375}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '속도는 재능이 아니라 반복이 만든 결과입니다.', 'activity', 'rare', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":330}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '속도는 재능이 아니라 반복이 만든 결과입니다.', 'activity', 'epic', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":300}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '속도는 재능이 아니라 반복이 만든 결과입니다.', 'activity', 'mystic', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":270}'::jsonb, ARRAY['running']::text[]),
    -- running:L1 · 긴 하루 — 한 번에 15km
    ('긴 하루', '한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.', 'activity', 'common', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":15}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.', 'activity', 'rare', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":21}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.', 'activity', 'epic', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":32}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.', 'activity', 'mystic', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":42}'::jsonb, ARRAY['running']::text[]),
    -- running:C1 · 오늘의 한 발 — 하루 1회 / 1회
    ('오늘의 한 발', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":1}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'rare', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":30}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'epic', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":100}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'mystic', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":300}'::jsonb, ARRAY['running']::text[]),
    -- running:C2 · 이번 주의 페이스 — 한 주(월~일)에 4회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 페이스', '네 번을 채운 주에는 몸이 먼저 알아차립니다.', 'activity', 'common', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '네 번을 채운 주에는 몸이 먼저 알아차립니다.', 'activity', 'rare', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":8}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '네 번을 채운 주에는 몸이 먼저 알아차립니다.', 'activity', 'epic', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":26}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '네 번을 채운 주에는 몸이 먼저 알아차립니다.', 'activity', 'mystic', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:C3 · 이달의 러닝 — 한 달에 120km
    ('이달의 러닝', '한 달을 통째로 달린 총량이 여기 남습니다.', 'activity', 'common', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":120}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '한 달을 통째로 달린 총량이 여기 남습니다.', 'activity', 'rare', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":217}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '한 달을 통째로 달린 총량이 여기 남습니다.', 'activity', 'epic', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":350}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '한 달을 통째로 달린 총량이 여기 남습니다.', 'activity', 'mystic', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":550}'::jsonb, ARRAY['running']::text[]),
    -- running:C4 · 계절의 러너 — 한 계절에 400km
    --   [필터] season + distance_km
    ('계절의 러너', '계절 하나를 달려서 통과했습니다.', 'activity', 'common', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":400}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '계절 하나를 달려서 통과했습니다.', 'activity', 'rare', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":650}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '계절 하나를 달려서 통과했습니다.', 'activity', 'epic', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":1100}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '계절 하나를 달려서 통과했습니다.', 'activity', 'mystic', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":1700}'::jsonb, ARRAY['running']::text[]),
    -- running:T1 · 새벽의 러너 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 러너', '해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.', 'activity', 'common', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.', 'activity', 'rare', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":15}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.', 'activity', 'epic', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.', 'activity', 'mystic', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":120}'::jsonb, ARRAY['running']::text[]),
    -- running:T2 · 밤의 러너 — 저녁 8시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 러너', '하루를 끝낸 몸으로 다시 시작하는 사람입니다.', 'activity', 'common', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '하루를 끝낸 몸으로 다시 시작하는 사람입니다.', 'activity', 'rare', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":15}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '하루를 끝낸 몸으로 다시 시작하는 사람입니다.', 'activity', 'epic', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '하루를 끝낸 몸으로 다시 시작하는 사람입니다.', 'activity', 'mystic', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":120}'::jsonb, ARRAY['running']::text[]),
    -- running:T3 · 해와 달의 주자 — 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회
    --   [필터] time_range + total_count
    --   [근사] A2와 같은 근사
    ('해와 달의 주자', '같은 하루의 양 끝을 모두 달렸습니다.', 'activity', 'common', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '같은 하루의 양 끝을 모두 달렸습니다.', 'activity', 'rare', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '같은 하루의 양 끝을 모두 달렸습니다.', 'activity', 'epic', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '같은 하루의 양 끝을 모두 달렸습니다.', 'activity', 'mystic', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:D1 · 월요일의 시작 — 월요일 / 1회
    --   [필터] day_of_week + total_count
    ('월요일의 시작', '한 주의 첫 단추를 달리기로 채웠습니다.', 'activity', 'common', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '한 주의 첫 단추를 달리기로 채웠습니다.', 'activity', 'rare', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":10}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '한 주의 첫 단추를 달리기로 채웠습니다.', 'activity', 'epic', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":30}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '한 주의 첫 단추를 달리기로 채웠습니다.', 'activity', 'mystic', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:D2 · 주말 장거리 — 주말에 한 번에 10km 이상 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사 — 토·일 각각 N회를 요구한다
    ('주말 장거리', '쉬는 날에 가장 멀리 가는 사람이 있습니다.', 'activity', 'common', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '쉬는 날에 가장 멀리 가는 사람이 있습니다.', 'activity', 'rare', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":8}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '쉬는 날에 가장 멀리 가는 사람이 있습니다.', 'activity', 'epic', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":25}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '쉬는 날에 가장 멀리 가는 사람이 있습니다.', 'activity', 'mystic', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:N1 · 사흘의 리듬 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 리듬', '사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.', 'activity', 'common', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.', 'activity', 'rare', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.', 'activity', 'epic', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.', 'activity', 'mystic', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:N2 · 일주일의 궤도 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'common', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('일주일의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'rare', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['running']::text[]),
    ('일주일의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'epic', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    -- running:N3 · 런 스트릭 — 30일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('런 스트릭', '매일 달리는 사람들의 오래된 전통에 합류했습니다.', 'activity', 'epic', NULL, 'running:N3', 16, '{"activity_type":"running","streak_days":30,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('런 스트릭', '매일 달리는 사람들의 오래된 전통에 합류했습니다.', 'activity', 'mystic', NULL, 'running:N3', 16, '{"activity_type":"running","streak_days":30,"repeat_count":2}'::jsonb, ARRAY['running']::text[]),
    -- running:R1 · 발끝의 한계 — 가장 긴 거리 갱신
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'running:R1', 17, '{"activity_type":"running","personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 2, 'running:R1', 17, '{"activity_type":"running","personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 3, 'running:R1', 17, '{"activity_type":"running","personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 4, 'running:R1', 17, '{"activity_type":"running","personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 5, 'running:R1', 17, '{"activity_type":"running","personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 6, 'running:R1', 17, '{"activity_type":"running","personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 7, 'running:R1', 17, '{"activity_type":"running","personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 8, 'running:R1', 17, '{"activity_type":"running","personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
    -- running:R2 · 더 빠르게 — 5km 이상 활동의 가장 빠른 페이스 갱신
    --   [근사] 「5km 이상 활동의 최고 페이스 갱신」 — 지표 지정 수단이 없어 single_distance_km로 대상만 좁혔다
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 1, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 2, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 3, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 4, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 5, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 6, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 7, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 8, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
    -- running:R3 · 지난달의 주자 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 2, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 3, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 4, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 5, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 6, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 7, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 8, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
    -- running:M1 · 500km 주자 — 누적 거리 500km
    ('500km 주자', '세 자리 숫자가 몸에 새겨졌습니다.', 'activity', 'rare', NULL, 'running:M1', 20, '{"activity_type":"running","distance_km":500}'::jsonb, ARRAY['running']::text[]),
    -- running:M2 · 2000km 클럽 — 누적 거리 2,000km
    ('2000km 클럽', '지도 위의 선이 국경을 넘을 길이가 됐습니다.', 'activity', 'epic', NULL, 'running:M2', 21, '{"activity_type":"running","distance_km":2000}'::jsonb, ARRAY['running']::text[]),
    -- running:M3 · 5000km 클럽 — 누적 거리 5,000km
    ('5000km 클럽', '이제 거리는 숫자가 아니라 시간의 단위입니다.', 'activity', 'mystic', NULL, 'running:M3', 22, '{"activity_type":"running","distance_km":5000}'::jsonb, ARRAY['running']::text[]),
    -- running:M4 · 백 번의 러닝 — 총 100회
    ('백 번의 러닝', '백 번을 나섰다는 사실만으로 충분합니다.', 'activity', 'rare', NULL, 'running:M4', 23, '{"activity_type":"running","total_count":100}'::jsonb, ARRAY['running']::text[]),
    -- running:M5 · 마라톤 완주 — 한 번에 42.195km
    ('마라톤 완주', '42.195라는 숫자를 몸으로 통과했습니다.', 'activity', 'mystic', NULL, 'running:M5', 24, '{"activity_type":"running","single_distance_km":42.195}'::jsonb, ARRAY['running']::text[]),
    -- running:X1 · 비워둔 하루 — 5일 연속 후 하루 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_streak)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_streak·streak_days
    ('비워둔 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'common', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('비워둔 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'rare', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":5}'::jsonb, ARRAY['running']::text[]),
    ('비워둔 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'epic', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":20}'::jsonb, ARRAY['running']::text[]),
    ('비워둔 하루', '쉬는 것도 계획에 있었습니다.', 'activity', 'mystic', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:X2 · 다음 날의 여백 — 한 번에 25km 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long·single_distance_km
    ('다음 날의 여백', '길게 달린 뒤에 무엇을 하지 않을지 아는 사람입니다.', 'activity', 'common', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('다음 날의 여백', '길게 달린 뒤에 무엇을 하지 않을지 아는 사람입니다.', 'activity', 'rare', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('다음 날의 여백', '길게 달린 뒤에 무엇을 하지 않을지 아는 사람입니다.', 'activity', 'epic', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    -- running:X3 · 돌아온 러너 — 14일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 러너', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('돌아온 러너', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'rare', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":3}'::jsonb, ARRAY['running']::text[]),
    ('돌아온 러너', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'epic', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    -- running:W1 · 한여름의 러너 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 러너', '가장 더운 두 달에도 발을 멈추지 않았습니다.', 'activity', 'common', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '가장 더운 두 달에도 발을 멈추지 않았습니다.', 'activity', 'rare', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '가장 더운 두 달에도 발을 멈추지 않았습니다.', 'activity', 'epic', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '가장 더운 두 달에도 발을 멈추지 않았습니다.', 'activity', 'mystic', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:W2 · 한겨울의 러너 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 러너', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'common', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'rare', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'epic', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'mystic', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:W3 · 사계절의 주자 — 네 계절 각 10회 / 1회
    ('사계절의 주자', '일 년을 네 조각으로 나눠 모두 달렸습니다.', 'activity', 'epic', NULL, 'running:W3', 30, '{"activity_type":"running","season_count_all":10}'::jsonb, ARRAY['running']::text[]),
    ('사계절의 주자', '일 년을 네 조각으로 나눠 모두 달렸습니다.', 'activity', 'mystic', NULL, 'running:W3', 30, '{"activity_type":"running","season_count_all":20}'::jsonb, ARRAY['running']::text[]),
    -- running:H1 · 심박의 주인 — 한 번에 30분 이상, 평균 심박 160bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('심박의 주인', '심장이 어디까지 견디는지 아는 사람입니다.', 'activity', 'common', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '심장이 어디까지 견디는지 아는 사람입니다.', 'activity', 'rare', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '심장이 어디까지 견디는지 아는 사람입니다.', 'activity', 'epic', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '심장이 어디까지 견디는지 아는 사람입니다.', 'activity', 'mystic', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":100}'::jsonb, ARRAY['running']::text[]),
    -- running:H2 · 180의 리듬 — 평균 케이던스 180spm 이상 / 1회
    --   [회차] 미소비 키 avg_cadence
    ('180의 리듬', '발이 땅에 닿는 간격까지 관리하는 단계입니다.', 'activity', 'common', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '발이 땅에 닿는 간격까지 관리하는 단계입니다.', 'activity', 'rare', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '발이 땅에 닿는 간격까지 관리하는 단계입니다.', 'activity', 'epic', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '발이 땅에 닿는 간격까지 관리하는 단계입니다.', 'activity', 'mystic', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":100}'::jsonb, ARRAY['running']::text[]),
    -- running:Q1 · 쌓인 거리의 증명 — 미션 '2주 안에 80km' 완료
    ('쌓인 거리의 증명', '미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q1', 33, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q2 · 페이스의 증명 — 미션 '4주 안에 한 번에 10km 이상, 5:30/km보다 빠르게 / 3회' 완료
    ('페이스의 증명', '미션으로만 얻는 열쇠입니다. 페이스 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q2', 34, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q3 · 먼 하루의 증명 — 미션 '4주 안에 한 번에 25km 이상 / 2회' 완료
    ('먼 하루의 증명', '미션으로만 얻는 열쇠입니다. 롱런 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q3', 35, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q4 · 반복의 증명 — 미션 '3주(월~일) 연속 한 주에 4회' 완료
    ('반복의 증명', '미션으로만 얻는 열쇠입니다. 주기 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q4', 36, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q5 · 시간표의 증명 — 미션 '2주 안에 새벽·밤 각 2회, 서로 다른 5개 요일' 완료
    ('시간표의 증명', '미션으로만 얻는 열쇠입니다. 시간대·요일 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q5', 37, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q6 · 연이은 날의 증명 — 미션 '7일 연속' 완료
    ('연이은 날의 증명', '미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q6', 38, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q7 · 쉼표의 증명 — 미션 '4주(월~일) 연속 한 주에 4회, 매주 2일 이상 휴식' 완료
    ('쉼표의 증명', '미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q7', 39, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- running:Q8 · 사계의 증명 — 미션 '서로 다른 두 달에 각각 120km' 완료
    ('사계의 증명', '미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'running:Q8', 40, '{"activity_type":"running","mission_reward":true}'::jsonb, ARRAY['running']::text[]),
    -- cycling:K1 · 굴러온 거리 — 누적 거리 80km
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 1, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":80}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 2, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":250}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 3, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":600}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 4, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":1300}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 5, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":2500}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 6, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":4200}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 7, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":8000}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.', 'activity', NULL, 8, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":14000}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:K2 · 바퀴로 오른 고도 — 누적 상승고도 1,000m
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 1, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":1000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 2, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":3000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 3, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":8000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 4, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":22000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 5, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":38000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 6, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":70000}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:K3 · 안장에 오른 횟수 — 총 8회
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 1, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 2, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":25}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 3, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":55}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 4, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":100}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 5, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":170}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 6, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":280}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:P1 · 속도의 주인 — 한 번에 30km 이상, 평균 속도 22km/h 이상
    ('속도의 주인', '평균 속도는 다리보다 페이스 감각이 만듭니다.', 'activity', 'common', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":22}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '평균 속도는 다리보다 페이스 감각이 만듭니다.', 'activity', 'rare', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":25}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '평균 속도는 다리보다 페이스 감각이 만듭니다.', 'activity', 'epic', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":28}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '평균 속도는 다리보다 페이스 감각이 만듭니다.', 'activity', 'mystic', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":32}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:V1 · 다운힐 — 한 번에 최고 속도 45km/h 이상
    ('다운힐', '내리막에서 브레이크를 놓아본 적이 있습니다.', 'activity', 'common', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":45}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '내리막에서 브레이크를 놓아본 적이 있습니다.', 'activity', 'rare', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":55}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '내리막에서 브레이크를 놓아본 적이 있습니다.', 'activity', 'epic', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":65}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '내리막에서 브레이크를 놓아본 적이 있습니다.', 'activity', 'mystic', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":75}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:L1 · 안장 위의 하루 — 한 번에 80km
    ('안장 위의 하루', '해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.', 'activity', 'common', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":80}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.', 'activity', 'rare', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":120}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.', 'activity', 'epic', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":160}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.', 'activity', 'mystic', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":200}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:E1 · 언덕의 사람 — 한 번에 상승고도 500m 이상
    ('언덕의 사람', '오르막을 피하지 않는 사람이 따로 있습니다.', 'activity', 'common', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":500}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '오르막을 피하지 않는 사람이 따로 있습니다.', 'activity', 'rare', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":1000}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '오르막을 피하지 않는 사람이 따로 있습니다.', 'activity', 'epic', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":1600}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '오르막을 피하지 않는 사람이 따로 있습니다.', 'activity', 'mystic', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":2500}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C1 · 오늘의 바퀴 — 하루 1회 / 1회
    ('오늘의 바퀴', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'rare', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":25}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'epic', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":80}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'mystic', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":250}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C2 · 이번 주의 바퀴 — 한 주(월~일)에 3회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 바퀴', '세 번을 채운 주에는 다리가 먼저 알아차립니다.', 'activity', 'common', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '세 번을 채운 주에는 다리가 먼저 알아차립니다.', 'activity', 'rare', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '세 번을 채운 주에는 다리가 먼저 알아차립니다.', 'activity', 'epic', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":26}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '세 번을 채운 주에는 다리가 먼저 알아차립니다.', 'activity', 'mystic', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":52}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C3 · 이달의 라이더 — 한 달에 400km
    ('이달의 라이더', '한 달의 총량은 하루의 컨디션을 이깁니다.', 'activity', 'common', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":400}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '한 달의 총량은 하루의 컨디션을 이깁니다.', 'activity', 'rare', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":867}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '한 달의 총량은 하루의 컨디션을 이깁니다.', 'activity', 'epic', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":1400}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '한 달의 총량은 하루의 컨디션을 이깁니다.', 'activity', 'mystic', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":2200}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C4 · 계절의 라이더 — 한 계절에 1,300km
    --   [필터] season + distance_km
    ('계절의 라이더', '계절 하나를 바퀴로 통과했습니다.', 'activity', 'common', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":1300}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '계절 하나를 바퀴로 통과했습니다.', 'activity', 'rare', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":2600}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '계절 하나를 바퀴로 통과했습니다.', 'activity', 'epic', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":4200}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '계절 하나를 바퀴로 통과했습니다.', 'activity', 'mystic', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":6500}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:D1 · 주말 라이더 — 주말 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사
    ('주말 라이더', '주말의 도로는 이 사람들의 것입니다.', 'activity', 'common', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '주말의 도로는 이 사람들의 것입니다.', 'activity', 'rare', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '주말의 도로는 이 사람들의 것입니다.', 'activity', 'epic', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":35}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '주말의 도로는 이 사람들의 것입니다.', 'activity', 'mystic', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:D2 · 평일의 반란 — 평일에 한 번에 100km 이상 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「평일」을 요일별 독립 카운터로 근사
    ('평일의 반란', '평일에 100km를 타려면 무언가를 포기해야 합니다.', 'activity', 'common', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '평일에 100km를 타려면 무언가를 포기해야 합니다.', 'activity', 'rare', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '평일에 100km를 타려면 무언가를 포기해야 합니다.', 'activity', 'epic', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '평일에 100km를 타려면 무언가를 포기해야 합니다.', 'activity', 'mystic', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N1 · 사흘의 바퀴 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 바퀴', '사흘 연속은 다리보다 일정이 먼저 무너집니다.', 'activity', 'common', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '사흘 연속은 다리보다 일정이 먼저 무너집니다.', 'activity', 'rare', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '사흘 연속은 다리보다 일정이 먼저 무너집니다.', 'activity', 'epic', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '사흘 연속은 다리보다 일정이 먼저 무너집니다.', 'activity', 'mystic', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N2 · 일곱 바퀴의 궤도 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일곱 바퀴의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'common', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('일곱 바퀴의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'rare', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('일곱 바퀴의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'epic', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N3 · 삼 주의 바퀴 — 21일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('삼 주의 바퀴', '삼 주를 끊지 않는 것은 훈련이 아니라 생활입니다.', 'activity', 'epic', NULL, 'cycling:N3', 16, '{"activity_type":"cycling","streak_days":21,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('삼 주의 바퀴', '삼 주를 끊지 않는 것은 훈련이 아니라 생활입니다.', 'activity', 'mystic', NULL, 'cycling:N3', 16, '{"activity_type":"cycling","streak_days":21,"repeat_count":2}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:G1 · 격주의 약속 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('격주의 약속', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'common', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'rare', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'epic', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'mystic', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:R1 · 바퀴의 한계 — 가장 긴 거리 갱신
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":1}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 2, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":2}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 3, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":3}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 4, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":4}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 5, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":5}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 6, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":6}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 7, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":7}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 8, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":8}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:R2 · 지난달의 라이더 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 2, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 3, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 4, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 5, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 6, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 7, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 8, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:M1 · 센추리 라이드 — 한 번에 100km
    ('센추리 라이드', '하루에 100km — 라이더들이 첫 목표로 삼는 숫자입니다.', 'activity', 'rare', NULL, 'cycling:M1', 20, '{"activity_type":"cycling","single_distance_km":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:M2 · 그란폰도 — 한 번에 160km
    ('그란폰도', '160km는 대회의 거리이자 하루의 한계입니다.', 'activity', 'epic', NULL, 'cycling:M2', 21, '{"activity_type":"cycling","single_distance_km":160}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:M3 · 브레베 — 한 번에 200km
    ('브레베', '200km를 하루에 끝내는 사람은 많지 않습니다.', 'activity', 'mystic', NULL, 'cycling:M3', 22, '{"activity_type":"cycling","single_distance_km":200}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:M4 · 10000km 클럽 — 누적 거리 10,000km
    ('10000km 클럽', '다섯 자리 숫자를 바퀴로 만들었습니다.', 'activity', 'epic', NULL, 'cycling:M4', 23, '{"activity_type":"cycling","distance_km":10000}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:M5 · 바퀴로 쌓은 열 채 — 누적 상승고도 88,480m
    ('바퀴로 쌓은 열 채', '누적 고도가 세계 최고봉의 열 배가 됐습니다.', 'activity', 'mystic', NULL, 'cycling:M5', 24, '{"activity_type":"cycling","elevation_gain_m":88480}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:X1 · 안장의 휴일 — 한 번에 150km 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long·single_distance_km
    ('안장의 휴일', '길게 탄 다음 날을 비워두는 법을 압니다.', 'activity', 'common', NULL, 'cycling:X1', 25, '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('안장의 휴일', '길게 탄 다음 날을 비워두는 법을 압니다.', 'activity', 'rare', NULL, 'cycling:X1', 25, '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('안장의 휴일', '길게 탄 다음 날을 비워두는 법을 압니다.', 'activity', 'epic', NULL, 'cycling:X1', 25, '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:X2 · 돌아온 라이더 — 30일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 라이더', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('돌아온 라이더', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'rare', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('돌아온 라이더', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'epic', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W1 · 한여름의 라이더 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 라이더', '아스팔트가 달아오른 날에도 나섰습니다.', 'activity', 'common', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '아스팔트가 달아오른 날에도 나섰습니다.', 'activity', 'rare', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '아스팔트가 달아오른 날에도 나섰습니다.', 'activity', 'epic', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '아스팔트가 달아오른 날에도 나섰습니다.', 'activity', 'mystic', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W2 · 한겨울의 라이더 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 라이더', '손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.', 'activity', 'common', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.', 'activity', 'rare', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.', 'activity', 'epic', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.', 'activity', 'mystic', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":30}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W3 · 사계절의 라이더 — 네 계절 각 5회 / 1회
    ('사계절의 라이더', '일 년을 네 조각으로 나눠 모두 탔습니다.', 'activity', 'epic', NULL, 'cycling:W3', 29, '{"activity_type":"cycling","season_count_all":5}'::jsonb, ARRAY['cycling']::text[]),
    ('사계절의 라이더', '일 년을 네 조각으로 나눠 모두 탔습니다.', 'activity', 'mystic', NULL, 'cycling:W3', 29, '{"activity_type":"cycling","season_count_all":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:H1 · 와트의 주인 — 한 번에 1시간 이상, 평균 파워 200W 이상 / 1회
    --   [회차] 미소비 키 avg_watts
    ('와트의 주인', '출력을 숫자로 관리하는 단계에 들어섰습니다.', 'activity', 'common', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '출력을 숫자로 관리하는 단계에 들어섰습니다.', 'activity', 'rare', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '출력을 숫자로 관리하는 단계에 들어섰습니다.', 'activity', 'epic', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '출력을 숫자로 관리하는 단계에 들어섰습니다.', 'activity', 'mystic', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:H2 · 안장 위의 심장 — 한 번에 1시간 이상, 평균 심박 150bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('안장 위의 심장', '다리보다 먼저 한계를 말하는 기관이 있습니다.', 'activity', 'common', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '다리보다 먼저 한계를 말하는 기관이 있습니다.', 'activity', 'rare', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '다리보다 먼저 한계를 말하는 기관이 있습니다.', 'activity', 'epic', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '다리보다 먼저 한계를 말하는 기관이 있습니다.', 'activity', 'mystic', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q1 · 바퀴 자국의 증명 — 미션 '2주 안에 330km' 완료
    ('바퀴 자국의 증명', '미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q1', 32, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q2 · 속도의 증명 — 미션 '4주 안에 한 번에 30km 이상, 평균 속도 25km/h 이상 / 3회' 완료
    ('속도의 증명', '미션으로만 얻는 열쇠입니다. 속도·최고속도 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q2', 33, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q3 · 지평선의 증명 — 미션 '4주 안에 한 번에 130km 이상 / 2회' 완료
    ('지평선의 증명', '미션으로만 얻는 열쇠입니다. 롱라이드 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q3', 34, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q4 · 언덕의 증명 — 미션 '4주 안에 한 번에 상승고도 1,200m 이상 / 2회' 완료
    ('언덕의 증명', '미션으로만 얻는 열쇠입니다. 고도 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q4', 35, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q5 · 주말의 증명 — 미션 '3주(월~일) 연속 한 주에 3회, 매주 주말 1회 이상' 완료
    ('주말의 증명', '미션으로만 얻는 열쇠입니다. 주기·주말 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q5', 36, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q6 · 이어진 바퀴의 증명 — 미션 '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상' 완료
    ('이어진 바퀴의 증명', '미션으로만 얻는 열쇠입니다. 연속·간격 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q6', 37, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q7 · 빈 안장의 증명 — 미션 '8주 안에 한 번에 100km 이상, 다음 날 휴식 / 3회' 완료
    ('빈 안장의 증명', '미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q7', 38, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:Q8 · 추위와 더위의 증명 — 미션 '서로 다른 두 달에 각각 500km' 완료
    ('추위와 더위의 증명', '미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'cycling:Q8', 39, '{"activity_type":"cycling","mission_reward":true}'::jsonb, ARRAY['cycling']::text[]),
    -- hiking:K1 · 올라온 고도 — 누적 상승고도 1,500m
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 1, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":1500}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 2, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":5000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 3, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":12000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 4, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":25000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 5, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":48000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '산에서는 거리가 아니라 높이가 기록입니다.', 'activity', NULL, 6, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":85000}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:K3 · 오른 횟수 — 총 5회
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 1, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 2, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":15}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 3, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 4, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":80}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 5, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":150}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 6, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":260}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:P1 · 고도의 사람 — 한 번에 상승고도 500m 이상
    ('고도의 사람', '한 번에 오른 높이가 그 사람의 기준입니다.', 'activity', 'common', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":500}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '한 번에 오른 높이가 그 사람의 기준입니다.', 'activity', 'rare', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":750}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '한 번에 오른 높이가 그 사람의 기준입니다.', 'activity', 'epic', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":1200}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '한 번에 오른 높이가 그 사람의 기준입니다.', 'activity', 'mystic', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":1800}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:A1 · 높은 곳 — 한 번에 최고 도달 고도 700m 이상
    ('높은 곳', '얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.', 'activity', 'common', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":700}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.', 'activity', 'rare', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1200}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.', 'activity', 'epic', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1600}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.', 'activity', 'mystic', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1900}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:L1 · 산에서의 하루 — 한 번에 3시간
    ('산에서의 하루', '해가 뜨고 지는 동안 산에 있었습니다.', 'activity', 'common', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":180}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '해가 뜨고 지는 동안 산에 있었습니다.', 'activity', 'rare', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":300}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '해가 뜨고 지는 동안 산에 있었습니다.', 'activity', 'epic', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":480}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '해가 뜨고 지는 동안 산에 있었습니다.', 'activity', 'mystic', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":720}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:L2 · 종주 — 한 번에 12km
    ('종주', '능선을 따라 끝에서 끝까지 걸었습니다.', 'activity', 'common', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":12}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '능선을 따라 끝에서 끝까지 걸었습니다.', 'activity', 'rare', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":18}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '능선을 따라 끝에서 끝까지 걸었습니다.', 'activity', 'epic', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":25}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '능선을 따라 끝에서 끝까지 걸었습니다.', 'activity', 'mystic', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":35}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:C1 · 산에 간 날 — 하루 1회 / 1회
    ('산에 간 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'rare', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'epic', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'mystic', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":120}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:C3 · 계절의 등반자 — 한 계절에 상승고도 4,000m
    --   [필터] season + elevation_gain_m
    ('계절의 등반자', '계절 하나를 고도로 통과했습니다.', 'activity', 'common', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":4000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '계절 하나를 고도로 통과했습니다.', 'activity', 'rare', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":9000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '계절 하나를 고도로 통과했습니다.', 'activity', 'epic', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":15000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '계절 하나를 고도로 통과했습니다.', 'activity', 'mystic', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":24000}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:D1 · 주말 산행 — 주말 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사
    ('주말 산행', '주말마다 도시를 벗어나는 사람이 있습니다.', 'activity', 'common', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '주말마다 도시를 벗어나는 사람이 있습니다.', 'activity', 'rare', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '주말마다 도시를 벗어나는 사람이 있습니다.', 'activity', 'epic', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '주말마다 도시를 벗어나는 사람이 있습니다.', 'activity', 'mystic', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":100}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N1 · 이틀 연속의 산 — 2일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('이틀 연속의 산', '하루 만에 회복하고 다시 올랐습니다.', 'activity', 'common', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '하루 만에 회복하고 다시 올랐습니다.', 'activity', 'rare', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '하루 만에 회복하고 다시 올랐습니다.', 'activity', 'epic', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '하루 만에 회복하고 다시 올랐습니다.', 'activity', 'mystic', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":50}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N2 · 사흘의 능선 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 능선', '사흘째 다리는 거짓말을 하지 않습니다.', 'activity', 'common', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('사흘의 능선', '사흘째 다리는 거짓말을 하지 않습니다.', 'activity', 'rare', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('사흘의 능선', '사흘째 다리는 거짓말을 하지 않습니다.', 'activity', 'epic', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":10}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N3 · 일주일의 산 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 산', '일곱 밤을 산으로 채웠습니다.', 'activity', 'epic', NULL, 'hiking:N3', 12, '{"activity_type":"hiking","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('일주일의 산', '일곱 밤을 산으로 채웠습니다.', 'activity', 'mystic', NULL, 'hiking:N3', 12, '{"activity_type":"hiking","streak_days":7,"repeat_count":2}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:G1 · 산을 잊지 않는 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('산을 잊지 않는', '끊기지 않는 것이 높이 오르는 것보다 어렵습니다.', 'activity', 'common', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '끊기지 않는 것이 높이 오르는 것보다 어렵습니다.', 'activity', 'rare', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '끊기지 않는 것이 높이 오르는 것보다 어렵습니다.', 'activity', 'epic', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '끊기지 않는 것이 높이 오르는 것보다 어렵습니다.', 'activity', 'mystic', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:R1 · 더 높이 — 가장 높은 도달 고도 갱신
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 1, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":1}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 2, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":2}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 3, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":3}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 4, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":4}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 5, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":5}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 6, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":6}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 7, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":7}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 8, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":8}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:R2 · 능선 위의 시간 — 가장 긴 이동시간 갱신
    --   [근사] H-R1과 같은 사유 — personal_record_break에 지표 지정이 없다
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 1, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":1}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 2, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":2}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 3, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":3}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 4, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":4}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 5, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":5}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 6, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":6}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 7, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":7}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 8, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":8}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:M1 · 에베레스트 한 채 — 누적 상승고도 8,848m
    ('에베레스트 한 채', '누적 고도가 세계 최고봉과 같아졌습니다.', 'activity', 'rare', NULL, 'hiking:M1', 16, '{"activity_type":"hiking","elevation_gain_m":8848}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:M2 · 에베레스트 다섯 채 — 누적 상승고도 44,240m
    ('에베레스트 다섯 채', '다섯 번 쌓아 올릴 높이를 걸어서 만들었습니다.', 'activity', 'epic', NULL, 'hiking:M2', 17, '{"activity_type":"hiking","elevation_gain_m":44240}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:M3 · 에베레스트 열 채 — 누적 상승고도 88,480m
    ('에베레스트 열 채', '이제 높이는 목표가 아니라 이력입니다.', 'activity', 'mystic', NULL, 'hiking:M3', 18, '{"activity_type":"hiking","elevation_gain_m":88480}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:M4 · 백 번의 산 — 총 100회
    ('백 번의 산', '백 번을 올랐다는 사실만으로 충분합니다.', 'activity', 'epic', NULL, 'hiking:M4', 19, '{"activity_type":"hiking","total_count":100}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:X1 · 하산 다음 날 — 한 번에 8시간 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long
    --   [근사] 「8시간 이상 산행 다음 날 휴식」 — R2와 같은 짝 필드 제약
    ('하산 다음 날', '오래 걸은 몸이 무엇을 요구하는지 압니다.', 'activity', 'common', NULL, 'hiking:X1', 20, '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('하산 다음 날', '오래 걸은 몸이 무엇을 요구하는지 압니다.', 'activity', 'rare', NULL, 'hiking:X1', 20, '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('하산 다음 날', '오래 걸은 몸이 무엇을 요구하는지 압니다.', 'activity', 'epic', NULL, 'hiking:X1', 20, '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:X2 · 돌아온 등반자 — 60일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 등반자', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('돌아온 등반자', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'rare', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('돌아온 등반자', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'epic', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":8}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W1 · 한여름의 등반자 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 등반자', '가장 더운 두 달에도 능선에 섰습니다.', 'activity', 'common', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '가장 더운 두 달에도 능선에 섰습니다.', 'activity', 'rare', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":4}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '가장 더운 두 달에도 능선에 섰습니다.', 'activity', 'epic', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '가장 더운 두 달에도 능선에 섰습니다.', 'activity', 'mystic', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":30}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W2 · 한겨울의 등반자 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 등반자', '겨울 산은 장비와 판단을 함께 요구합니다.', 'activity', 'common', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '겨울 산은 장비와 판단을 함께 요구합니다.', 'activity', 'rare', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":4}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '겨울 산은 장비와 판단을 함께 요구합니다.', 'activity', 'epic', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '겨울 산은 장비와 판단을 함께 요구합니다.', 'activity', 'mystic', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":30}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W3 · 사계절의 등반자 — 네 계절 각 3회 / 1회
    ('사계절의 등반자', '같은 산의 네 얼굴을 모두 봤습니다.', 'activity', 'epic', NULL, 'hiking:W3', 24, '{"activity_type":"hiking","season_count_all":3}'::jsonb, ARRAY['hiking']::text[]),
    ('사계절의 등반자', '같은 산의 네 얼굴을 모두 봤습니다.', 'activity', 'mystic', NULL, 'hiking:W3', 24, '{"activity_type":"hiking","season_count_all":6}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q1 · 쌓인 고도의 증명 — 미션 '2개월 안에 상승고도 5,000m' 완료
    ('쌓인 고도의 증명', '미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q1', 25, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q2 · 높이의 증명 — 미션 '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 / 1회' 완료
    ('높이의 증명', '미션으로만 얻는 열쇠입니다. 단일고도·최고도달 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q2', 26, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q3 · 긴 산행의 증명 — 미션 '3개월 안에 한 번에 6시간 이상 / 2회' 완료
    ('긴 산행의 증명', '미션으로만 얻는 열쇠입니다. 긴 산행 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q3', 27, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q4 · 발길의 증명 — 미션 '3개월 연속 한 달에 4회, 매달 주말 2회 이상' 완료
    ('발길의 증명', '미션으로만 얻는 열쇠입니다. 주기·주말 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q4', 28, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q5 · 이어진 능선의 증명 — 미션 '3일 연속' 완료
    ('이어진 능선의 증명', '미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q5', 29, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q6 · 돌아오는 산의 증명 — 미션 '6개월 연속 한 달에 2회 이상' 완료
    ('돌아오는 산의 증명', '미션으로만 얻는 열쇠입니다. 간격 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q6', 30, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q7 · 하산 뒤의 증명 — 미션 '3개월 안에 한 번에 5시간 이상, 다음 날 휴식 / 2회' 완료
    ('하산 뒤의 증명', '미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q7', 31, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:Q8 · 눈과 볕의 증명 — 미션 '서로 다른 두 달에 각각 상승고도 1,800m' 완료
    ('눈과 볕의 증명', '미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'hiking:Q8', 32, '{"activity_type":"hiking","mission_reward":true}'::jsonb, ARRAY['hiking']::text[]),
    -- trail_running:K1 · 산길을 달려온 거리 — 누적 거리 20km
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 1, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":20}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 2, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":60}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 3, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":150}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 4, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":320}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 5, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":600}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 6, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":1100}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 7, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":1900}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '포장되지 않은 길만 골라 쌓은 거리입니다.', 'activity', NULL, 8, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":3200}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:K2 · 달려서 오른 고도 — 누적 상승고도 700m
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 1, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":700}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 2, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":2200}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 3, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":5000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 4, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":11000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 5, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":20000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 6, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":36000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 7, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":70000}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:K3 · 산을 달린 횟수 — 총 8회
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 1, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 2, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 3, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":55}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 4, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":100}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 5, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":170}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 6, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":280}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:P1 · 산을 달리는 자 — 한 번에 15km 이상, 상승고도 400m 이상
    ('산을 달리는 자', '거리만으로도 고도만으로도 설명되지 않는 종목입니다.', 'activity', 'common', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":15,"single_elevation_m":400}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '거리만으로도 고도만으로도 설명되지 않는 종목입니다.', 'activity', 'rare', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":25,"single_elevation_m":800}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '거리만으로도 고도만으로도 설명되지 않는 종목입니다.', 'activity', 'epic', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":35,"single_elevation_m":1500}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '거리만으로도 고도만으로도 설명되지 않는 종목입니다.', 'activity', 'mystic', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":50,"single_elevation_m":2500}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:L1 · 능선의 하루 — 한 번에 25km
    ('능선의 하루', '산에서 하루를 통째로 쓴 사람입니다.', 'activity', 'common', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '산에서 하루를 통째로 쓴 사람입니다.', 'activity', 'rare', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":42}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '산에서 하루를 통째로 쓴 사람입니다.', 'activity', 'epic', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":60}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '산에서 하루를 통째로 쓴 사람입니다.', 'activity', 'mystic', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":100}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:L2 · 산에서의 시간 — 한 번에 4시간
    ('산에서의 시간', '해가 움직이는 동안 계속 달렸습니다.', 'activity', 'common', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":240}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '해가 움직이는 동안 계속 달렸습니다.', 'activity', 'rare', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":420}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '해가 움직이는 동안 계속 달렸습니다.', 'activity', 'epic', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":720}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '해가 움직이는 동안 계속 달렸습니다.', 'activity', 'mystic', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":1080}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:E1 · 버티컬 — 한 번에 상승고도 800m 이상
    ('버티컬', '1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.', 'activity', 'common', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":800}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.', 'activity', 'rare', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":1500}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.', 'activity', 'epic', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":2500}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.', 'activity', 'mystic', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":3500}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:A1 · 높은 곳을 달리다 — 한 번에 최고 도달 고도 700m 이상
    ('높은 곳을 달리다', '능선 위에서 속도를 낸 적이 있습니다.', 'activity', 'common', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":700}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '능선 위에서 속도를 낸 적이 있습니다.', 'activity', 'rare', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1200}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '능선 위에서 속도를 낸 적이 있습니다.', 'activity', 'epic', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1600}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '능선 위에서 속도를 낸 적이 있습니다.', 'activity', 'mystic', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1900}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C1 · 산을 달린 날 — 하루 1회 / 1회
    ('산을 달린 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'rare', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'epic', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":80}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'mystic', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":250}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C2 · 이달의 트레일 — 한 달에 120km
    ('이달의 트레일', '한 달의 총량이 산에서의 체력을 만듭니다.', 'activity', 'common', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":120}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '한 달의 총량이 산에서의 체력을 만듭니다.', 'activity', 'rare', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":217}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '한 달의 총량이 산에서의 체력을 만듭니다.', 'activity', 'epic', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":350}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '한 달의 총량이 산에서의 체력을 만듭니다.', 'activity', 'mystic', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":550}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C3 · 계절의 트레일러 — 한 계절에 상승고도 4,000m
    --   [필터] season + elevation_gain_m
    ('계절의 트레일러', '계절 하나를 고도로 통과했습니다.', 'activity', 'common', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":4000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '계절 하나를 고도로 통과했습니다.', 'activity', 'rare', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":13000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '계절 하나를 고도로 통과했습니다.', 'activity', 'epic', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":22000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '계절 하나를 고도로 통과했습니다.', 'activity', 'mystic', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":35000}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:T1 · 새벽의 산 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 산', '해뜨기 전 산길은 다른 세계입니다.', 'activity', 'common', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '해뜨기 전 산길은 다른 세계입니다.', 'activity', 'rare', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":15}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '해뜨기 전 산길은 다른 세계입니다.', 'activity', 'epic', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '해뜨기 전 산길은 다른 세계입니다.', 'activity', 'mystic', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":120}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:T2 · 밤의 산 — 저녁 8시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 산', '헤드램프 하나로 산길을 달려본 사람입니다.', 'activity', 'common', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('밤의 산', '헤드램프 하나로 산길을 달려본 사람입니다.', 'activity', 'rare', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('밤의 산', '헤드램프 하나로 산길을 달려본 사람입니다.', 'activity', 'epic', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:N1 · 사흘의 산길 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 산길', '하강 충격은 사흘째에 몰려옵니다.', 'activity', 'common', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '하강 충격은 사흘째에 몰려옵니다.', 'activity', 'rare', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '하강 충격은 사흘째에 몰려옵니다.', 'activity', 'epic', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '하강 충격은 사흘째에 몰려옵니다.', 'activity', 'mystic', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:N2 · 일주일의 산길 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 산길', '일곱 밤을 산길로 채웠습니다.', 'activity', 'common', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('일주일의 산길', '일곱 밤을 산길로 채웠습니다.', 'activity', 'rare', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('일주일의 산길', '일곱 밤을 산길로 채웠습니다.', 'activity', 'epic', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:G1 · 산길을 잊지 않는 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('산길을 잊지 않는', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'common', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'rare', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'epic', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'mystic', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R1 · 더 멀리 — 가장 긴 거리 갱신
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 1, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 2, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 3, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 4, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 5, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 6, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 7, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 8, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R2 · 산길의 정점 — 가장 높은 도달 고도 갱신
    --   [근사] T-R1·T-R3와 같은 사유
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 1, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 2, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 3, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 4, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 5, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 6, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 7, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 8, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R3 · 산길 위의 시간 — 가장 긴 이동시간 갱신
    --   [근사] T-R1·T-R2와 같은 사유
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 1, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 2, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 3, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 4, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 5, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 6, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 7, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 8, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:M1 · 트레일 마라톤 — 한 번에 42.195km
    ('트레일 마라톤', '포장도로의 42km와는 다른 42km입니다.', 'activity', 'rare', NULL, 'trail_running:M1', 20, '{"activity_type":"trail_running","single_distance_km":42.195}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:M2 · 울트라 — 한 번에 50km
    ('울트라', '50km부터를 울트라라 부릅니다.', 'activity', 'epic', NULL, 'trail_running:M2', 21, '{"activity_type":"trail_running","single_distance_km":50}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:M3 · 백 킬로미터 — 한 번에 100km
    ('백 킬로미터', '하루와 밤을 이어 붙여야 닿는 거리입니다.', 'activity', 'mystic', NULL, 'trail_running:M3', 22, '{"activity_type":"trail_running","single_distance_km":100}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:M4 · 달려서 쌓은 한 채 — 누적 상승고도 8,848m
    ('달려서 쌓은 한 채', '산길에서 모은 높이가 세계 최고봉과 같아졌습니다.', 'activity', 'rare', NULL, 'trail_running:M4', 23, '{"activity_type":"trail_running","elevation_gain_m":8848}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:X1 · 내리막의 대가 — 한 번에 35km 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long·single_distance_km
    ('내리막의 대가', '올라간 만큼 내려온 다리에는 시간이 필요합니다.', 'activity', 'common', NULL, 'trail_running:X1', 24, '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('내리막의 대가', '올라간 만큼 내려온 다리에는 시간이 필요합니다.', 'activity', 'rare', NULL, 'trail_running:X1', 24, '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('내리막의 대가', '올라간 만큼 내려온 다리에는 시간이 필요합니다.', 'activity', 'epic', NULL, 'trail_running:X1', 24, '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:X2 · 돌아온 트레일러 — 30일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 트레일러', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('돌아온 트레일러', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'rare', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('돌아온 트레일러', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'epic', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":10}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:W1 · 한겨울의 트레일러 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 트레일러', '얼어붙은 산길을 달리는 사람은 드뭅니다.', 'activity', 'common', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('한겨울의 트레일러', '얼어붙은 산길을 달리는 사람은 드뭅니다.', 'activity', 'rare', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('한겨울의 트레일러', '얼어붙은 산길을 달리는 사람은 드뭅니다.', 'activity', 'epic', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:W2 · 사계절의 트레일러 — 네 계절 각 3회 / 1회
    ('사계절의 트레일러', '같은 산길의 네 얼굴을 모두 달렸습니다.', 'activity', 'epic', NULL, 'trail_running:W2', 27, '{"activity_type":"trail_running","season_count_all":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('사계절의 트레일러', '같은 산길의 네 얼굴을 모두 달렸습니다.', 'activity', 'mystic', NULL, 'trail_running:W2', 27, '{"activity_type":"trail_running","season_count_all":6}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:H1 · 오르막의 심장 — 한 번에 1시간 이상, 평균 심박 155bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('오르막의 심장', '숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.', 'activity', 'common', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.', 'activity', 'rare', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.', 'activity', 'epic', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.', 'activity', 'mystic', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":70}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q1 · 오르내린 거리의 증명 — 미션 '2주 안에 80km, 상승고도 1,600m' 완료
    ('오르내린 거리의 증명', '미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q1', 29, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q2 · 오르막의 증명 — 미션 '8주 안에 한 번에 25km 이상, 상승고도 800m 이상 / 2회' 완료
    ('오르막의 증명', '미션으로만 얻는 열쇠입니다. 거리×고도 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q2', 30, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q3 · 울트라의 증명 — 미션 '한 번에 42km 이상 / 1회' 완료
    ('울트라의 증명', '미션으로만 얻는 열쇠입니다. 울트라 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q3', 31, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q4 · 수직의 증명 — 미션 '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 / 1회' 완료
    ('수직의 증명', '미션으로만 얻는 열쇠입니다. 버티컬·최고도달 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q4', 32, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q5 · 해뜨기 전의 증명 — 미션 '3주(월~일) 연속 한 주에 3회, 매주 새벽 5시~아침 8시 1회 이상' 완료
    ('해뜨기 전의 증명', '미션으로만 얻는 열쇠입니다. 주기·시간대 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q5', 33, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q6 · 이어 달린 산길의 증명 — 미션 '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상' 완료
    ('이어 달린 산길의 증명', '미션으로만 얻는 열쇠입니다. 연속·간격 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q6', 34, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q7 · 내리막 뒤의 증명 — 미션 '8주 안에 한 번에 25km 이상, 다음 날 휴식 / 2회' 완료
    ('내리막 뒤의 증명', '미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q7', 35, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:Q8 · 사철 산길의 증명 — 미션 '서로 다른 두 달에 각각 120km' 완료
    ('사철 산길의 증명', '미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.', 'activity', 'epic', NULL, 'trail_running:Q8', 36, '{"activity_type":"trail_running","mission_reward":true}'::jsonb, ARRAY['trail_running']::text[])
  ) AS v(name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.badges b
    WHERE b.family_key = v.family_key
      AND b.rarity IS NOT DISTINCT FROM v.rarity::badge_rarity
      AND b.level  IS NOT DISTINCT FROM v.level
      AND b.deleted_at IS NULL
 );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 행 수 — 630이어야 한다
-- SELECT count(*) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]';
--
-- -- ② 계열 수 — 194이어야 한다
-- SELECT count(DISTINCT family_key) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]';
--
-- -- ③ 계열 내 중복 — 0행이어야 한다 (등급형 (family_key, rarity) · 레벨형 (family_key, level))
-- SELECT family_key, rarity, count(*) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND level IS NULL
--  GROUP BY 1,2 HAVING count(*) > 1;
-- SELECT family_key, level, count(*) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND level IS NOT NULL
--  GROUP BY 1,2 HAVING count(*) > 1;
--
-- -- ④ 이름 중복 — 0행이어야 한다 (발급 엔진이 등급형을 이름으로 묶는다)
-- SELECT name, count(DISTINCT family_key) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL
--  GROUP BY 1 HAVING count(DISTINCT family_key) > 1;
--
-- -- ⑤ 미션 보상 배지 40종 — 걷기 8 + 4종목 32
-- SELECT count(*) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL AND (condition_json->>'mission_reward')::boolean IS TRUE;
--
-- ── 부분 유니크 인덱스 (선택) — 티켓 20260905_0027이 검토를 요구한 항목 ────────
--    시딩 «후에» 걸어야 한다. 구 207종에 중복이 남아 있으면 생성이 실패한다.
--    사전 조회: SELECT family_key, rarity, count(*) FROM public.badges
--                WHERE type='activity' AND deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1;
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_badges_family_rarity
--   ON public.badges (family_key, rarity)
--   WHERE family_key IS NOT NULL AND level IS NULL AND deleted_at IS NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_badges_family_level
--   ON public.badges (family_key, level)
--   WHERE family_key IS NOT NULL AND level IS NOT NULL AND deleted_at IS NULL;

-- ── 시딩에서 뺀 계열 (표현 수단이 레지스트리에 없다) ────────────────────────
--   · R-S1 — negative_split — splits 수집이 v5 1차에서 빠졌다 (티켓 20260905_0029 확정)
--   · K2 — 누적 이동시간을 담는 조건 키가 레지스트리에 없다 (duration_minutes는 «단일 활동»)
--   · R-K2 — 누적 이동시간 키 없음 (걷기 K2와 같은 사유)
--   · H-K2 — 누적 이동시간 키 없음 — A묶음의 위상 조정(170→180시간)도 함께 소멸한다
--   · C-G2 — «한 달 활동 횟수» 키 없음 — monthly_km는 거리이고 weekly_count는 주 단위다
--   · H-C2 — «한 달 활동 횟수» 키 없음 (C-G2와 같은 사유)

-- ↩️ 롤백 — 이 시드가 넣은 행만 지운다 (구 카탈로그는 family_key가 `{종목}:{한글이름}`이라 걸리지 않는다)
-- DELETE FROM public.badges
--  WHERE type='activity' AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z][0-9]*$';
