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
-- ⚠️ 문안(name·description)만 고쳐서 이 시드를 다시 돌려도 DB의 기존 행은 갱신되지 않는다
--    (WHERE NOT EXISTS가 이미 있는 행을 건너뛴다). v5_catalog_writing.json을 고치면:
--      v5_seed_build.py → 이 파일·rows.json 재생성 · v5_doc_build.mjs → 문서 재생성 ·
--      DB 반영은 별도 UPDATE 마이그레이션이 필요하다 (티켓 20260906_1421).
--    드리프트 확인: python3 "Service Plan/Specs/Content/v5_verify_db.py" (읽기 전용)
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
    ('걸어온 거리', '짧은 구간들이 모여 처음 보는 길이가 되었습니다.', 'activity', NULL, 2, 'walking:K1', 9, '{"activity_type":"walking","distance_km":15}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '지나온 자리가 이제 하나의 지도로 이어집니다.', 'activity', NULL, 3, 'walking:K1', 9, '{"activity_type":"walking","distance_km":40}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '지도 위에 남은 선이 도시의 크기를 넘어섭니다.', 'activity', NULL, 4, 'walking:K1', 9, '{"activity_type":"walking","distance_km":75}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '두 발로 닿을 수 있는 범위가 다시 넓어졌습니다.', 'activity', NULL, 5, 'walking:K1', 9, '{"activity_type":"walking","distance_km":130}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '여기서부터는 거리를 세는 단위가 달라집니다.', 'activity', NULL, 6, 'walking:K1', 9, '{"activity_type":"walking","distance_km":210}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '이 정도는 한 장의 지도에 담기지 않습니다.', 'activity', NULL, 7, 'walking:K1', 9, '{"activity_type":"walking","distance_km":330}'::jsonb, ARRAY['walking']::text[]),
    ('걸어온 거리', '화이트 룸은 이만큼을 남긴 발자국을 압니다.', 'activity', NULL, 8, 'walking:K1', 9, '{"activity_type":"walking","distance_km":550}'::jsonb, ARRAY['walking']::text[]),
    -- walking:K3 · 걸은 날들 — 누적 활동일수 3일
    ('걸은 날들', '며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.', 'activity', NULL, 1, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '달력에 표시된 날들이 서로 이어지기 시작합니다.', 'activity', NULL, 2, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '빈 칸보다 채워진 칸이 많아졌습니다.', 'activity', NULL, 3, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":22}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '날짜를 세는 일보다 세지 않는 일이 편해졌습니다.', 'activity', NULL, 4, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":40}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '달력은 이미 오래된 습관의 기록입니다.', 'activity', NULL, 5, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":70}'::jsonb, ARRAY['walking']::text[]),
    ('걸은 날들', '이만큼의 날들은 의지만으로 설명되지 않습니다.', 'activity', NULL, 6, 'walking:K3', 10, '{"activity_type":"walking","active_days_count":110}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P1 · 오늘의 한 걸음 — 하루 1회 / 1회
    ('오늘의 한 걸음', '하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.', 'activity', 'common', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '하루씩 쌓은 것들이 어느새 무시할 수 없는 부피가 되었습니다.', 'activity', 'rare', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '매일이라는 말은 결심이 아니라 상태가 되었습니다.', 'activity', 'epic', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":100}'::jsonb, ARRAY['walking']::text[]),
    ('오늘의 한 걸음', '하루를 거르지 않는 일은 재능이 아니라 성품입니다.', 'activity', 'mystic', NULL, 'walking:P1', 11, '{"activity_type":"walking","active_days_count":300}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P2 · 이번 주의 약속 — 한 주(월~일)에 3회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 약속', '스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.', 'activity', 'common', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '지켜진 주가 늘어날수록 약속은 가벼워집니다.', 'activity', 'rare', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '주 단위의 약속을 어긴 기억이 잘 떠오르지 않습니다.', 'activity', 'epic', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":26}'::jsonb, ARRAY['walking']::text[]),
    ('이번 주의 약속', '약속이라 부르지 않아도 지켜지는 일이 있습니다.', 'activity', 'mystic', NULL, 'walking:P2', 12, '{"activity_type":"walking","weekly_count":3,"repeat_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P3 · 이달의 걸음 — 한 달에 30km
    ('이달의 걸음', '한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.', 'activity', 'common', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":30}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '월말에 확인하는 총량이 점점 커집니다.', 'activity', 'rare', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":52}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '한 달의 합계는 하루의 성실을 숨기지 못합니다.', 'activity', 'epic', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":85}'::jsonb, ARRAY['walking']::text[]),
    ('이달의 걸음', '달이 바뀌어도 총량이 내려앉는 일이 없습니다.', 'activity', 'mystic', NULL, 'walking:P3', 13, '{"activity_type":"walking","monthly_km":130}'::jsonb, ARRAY['walking']::text[]),
    -- walking:P4 · 계절의 보행자 — 한 계절에 100km
    --   [필터] season + distance_km
    ('계절의 보행자', '계절 하나를 걸어서 통과했습니다.', 'activity', 'common', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":100}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '그루터기 살롱은 계절마다 돌아오는 손님을 압니다.', 'activity', 'rare', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":156}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '한 계절을 통째로 넘긴 기록이 여러 겹으로 쌓였습니다.', 'activity', 'epic', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":250}'::jsonb, ARRAY['walking']::text[]),
    ('계절의 보행자', '계절은 이 사람의 걸음을 막아 세우지 못합니다.', 'activity', 'mystic', NULL, 'walking:P4', 14, '{"activity_type":"walking","season":"all","distance_km":400}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A1 · 자정의 경계인 — 자정을 넘긴 활동 / 1회
    --   [필터] time_range + total_count
    --   [근사] 「자정을 넘긴 활동」은 시작 시각 범위로만 근사할 수 있다 (23:00~01:00)
    ('자정의 경계인', '하루와 하루 사이를 걸어서 넘어간 사람입니다.', 'activity', 'common', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '날짜가 바뀌는 자리를 여러 번 지나면 그 틈도 하나의 길이 됩니다.', 'activity', 'rare', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '하루의 이음매는 이제 낯선 시간이 아니라 익숙한 구역입니다.', 'activity', 'epic', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('자정의 경계인', '화이트 룸은 두 날 사이에 서 있던 사람을 알아봅니다.', 'activity', 'mystic', NULL, 'walking:A1', 15, '{"activity_type":"walking","time_range":{"start":"23:00","end":"01:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A2 · 해와 달 사이 — 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회
    --   [필터] time_range + total_count
    --   [근사] 「같은 날 아침 이전 + 저녁 이후 각 1회」를 20:00~08:00 한 구간으로 근사
    ('해와 달 사이', '같은 하루의 양 끝을 모두 밟았습니다.', 'activity', 'rare', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('해와 달 사이', '아침과 밤을 한 날에 이어 붙이는 일이 익숙해졌습니다.', 'activity', 'epic', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":8}'::jsonb, ARRAY['walking']::text[]),
    ('해와 달 사이', '하루의 양 끝을 쥔 사람에게 시간은 두 번 흐릅니다.', 'activity', 'mystic', NULL, 'walking:A2', 16, '{"activity_type":"walking","time_range":{"start":"20:00","end":"08:00"},"total_count":25}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A3 · 리듬 브레이커 — 3일 연속 서로 다른 시간대 / 1회
    --   [회차] 미소비 키 distinct_time_bands·streak_days
    ('리듬 브레이커', '몸에 밴 시간대를 사흘 내리 흔들었습니다.', 'activity', 'rare', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('리듬 브레이커', '흔들어 본 시간대가 늘수록 정해진 시간이라는 말이 흐려집니다.', 'activity', 'epic', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('리듬 브레이커', '어느 시간에 나서든 몸이 먼저 준비를 끝냅니다.', 'activity', 'mystic', NULL, 'walking:A3', 17, '{"activity_type":"walking","streak_days":3,"distinct_time_bands":3,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A4 · 스물넷의 산책 — 24시간 안에 3회 / 1회
    --   [회차] 미소비 키 activities_within_hours
    ('스물넷의 산책', '하루가 세 번의 산책을 견뎠습니다.', 'activity', 'rare', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('스물넷의 산책', '하루를 여러 조각으로 나눠 쓰는 방법을 몸이 익혔습니다.', 'activity', 'epic', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":4}'::jsonb, ARRAY['walking']::text[]),
    ('스물넷의 산책', '하루라는 단위가 이 사람 앞에서는 늘 모자랍니다.', 'activity', 'mystic', NULL, 'walking:A4', 18, '{"activity_type":"walking","activities_within_hours":{"hours":24,"count":3},"repeat_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A5 · 주말이 없다 — 4주(월~일) 연속 평일만 / 1회
    --   [회차] 미소비 키 weekly_streak
    --   [근사] 「토·일 0회」(부정 조건)를 표현할 수 없다 — 평일 요일 목록 + 연속 주로 근사
    ('주말이 없다', '쉬는 날에도 평일의 리듬을 지켰습니다.', 'activity', 'rare', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('주말이 없다', '평일이라는 틀이 흐트러지지 않은 채 몇 주를 건너갔습니다.', 'activity', 'epic', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('주말이 없다', '요일에 기대지 않는 리듬은 쉽게 무너지지 않습니다.', 'activity', 'mystic', NULL, 'walking:A5', 19, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"weekly_streak":4,"repeat_count":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A6 · 초하루의 사람 — 매달 1일 / 1회
    --   [필터] day_of_month + total_count
    ('초하루의 사람', '달이 바뀌는 첫날마다 신발을 신었습니다.', 'activity', 'rare', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('초하루의 사람', '달력의 첫 칸이 비어 있는 달이 좀처럼 없습니다.', 'activity', 'epic', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('초하루의 사람', '새 달의 첫 자리는 늘 같은 이름으로 채워져 있습니다.', 'activity', 'mystic', NULL, 'walking:A6', 20, '{"activity_type":"walking","day_of_month":1,"total_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A8 · 새벽의 사람 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 사람', '아무도 깨지 않은 시간을 혼자 씁니다.', 'activity', 'rare', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('새벽의 사람', '블랙 트랙의 새벽 구간은 이 사람의 발소리로 열립니다.', 'activity', 'epic', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('새벽의 사람', '해 뜨기 전의 도시에는 주인이 따로 있습니다.', 'activity', 'mystic', NULL, 'walking:A8', 21, '{"activity_type":"walking","time_range":{"start":"05:00","end":"08:00"},"total_count":60}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A9 · 밤의 보행자 — 밤 10시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 보행자', '밤 10시가 넘은 골목에도 걷는 사람이 있습니다.', 'activity', 'common', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '그루터기 살롱의 불빛이 늦은 걸음을 알아봅니다.', 'activity', 'rare', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":15}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '블랙 트랙의 밤 구역에 이름이 남습니다.', 'activity', 'epic', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    ('밤의 보행자', '화이트 룸은 밤을 지배하는 자를 기억합니다.', 'activity', 'mystic', NULL, 'walking:A9', 22, '{"activity_type":"walking","time_range":{"start":"22:00","end":"05:00"},"total_count":120}'::jsonb, ARRAY['walking']::text[]),
    -- walking:A10 · 점심의 탈출 — 낮 12시~2시 / 1회
    --   [필터] time_range + total_count
    ('점심의 탈출', '가장 짧은 자유 시간을 걸음에 씁니다.', 'activity', 'common', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '점심의 짧은 틈을 매번 되찾아 오는 사람이 있습니다.', 'activity', 'rare', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":15}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '하루 한가운데 뚫어 둔 틈을 누구도 건드리지 못합니다.', 'activity', 'epic', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    ('점심의 탈출', '정오의 짧은 틈을 온전히 자기 몫으로 만들었습니다.', 'activity', 'mystic', NULL, 'walking:A10', 23, '{"activity_type":"walking","time_range":{"start":"12:00","end":"14:00"},"total_count":120}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D0 · 일요일의 의식 — 일요일 / 1회
    --   [필터] day_of_week + total_count
    ('일요일의 의식', '한 주의 끝을 걸음으로 닫습니다.', 'activity', 'common', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '일요일마다 같은 자리에서 한 주를 정리합니다.', 'activity', 'rare', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '주말의 마지막 칸은 오래전부터 예약되어 있었습니다.', 'activity', 'epic', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('일요일의 의식', '일요일이라는 요일이 통째로 한 사람에게 넘어갔습니다.', 'activity', 'mystic', NULL, 'walking:D0', 24, '{"activity_type":"walking","day_of_week":"sunday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D1 · 월요병 극복자 — 월요일 / 1회
    --   [필터] day_of_week + total_count
    ('월요병 극복자', '가장 무거운 요일을 걸어서 넘깁니다.', 'activity', 'common', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '한 주의 첫 칸이 더는 가장 무거운 자리가 아닙니다.', 'activity', 'rare', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '월요일이 가벼워지면 나머지 요일도 따라 가벼워집니다.', 'activity', 'epic', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('월요병 극복자', '주가 시작되는 자리마다 같은 발자국이 찍혀 있습니다.', 'activity', 'mystic', NULL, 'walking:D1', 25, '{"activity_type":"walking","day_of_week":"monday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D2 · 불금은 없다 — 금요일 / 1회
    --   [필터] day_of_week + total_count
    ('불금은 없다', '금요일 밤의 유혹보다 걸음을 골랐습니다.', 'activity', 'common', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '금요일 저녁의 선택지는 오래전에 하나로 줄었습니다.', 'activity', 'rare', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '주말로 넘어가는 문턱에서 속도를 늦추는 법이 없습니다.', 'activity', 'epic', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('불금은 없다', '흘려보내지 않은 금요일 밤이 촘촘히 쌓여 있습니다.', 'activity', 'mystic', NULL, 'walking:D2', 26, '{"activity_type":"walking","day_of_week":"friday","total_count":52}'::jsonb, ARRAY['walking']::text[]),
    -- walking:D3 · 주 5일 완주 — 한 주(월~일)에 평일 5일 모두 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「한 주에 평일 5일 모두」를 요일별 독립 카운터(day_of_week 배열 + total_count)로 근사
    ('주 5일 완주', '평일 다섯 날을 하나도 빠뜨리지 않았습니다.', 'activity', 'rare', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('주 5일 완주', '빠진 요일 없는 한 주가 여러 번 반복되었습니다.', 'activity', 'epic', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('주 5일 완주', '평일이 통째로 채워진 주는 이제 특별한 일이 아닙니다.', 'activity', 'mystic', NULL, 'walking:D3', 27, '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S1 · 작심삼일의 파괴자 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('작심삼일의 파괴자', '사흘째가 가장 어렵다는 말을 스스로 반박했습니다.', 'activity', 'common', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '사흘의 고비는 이제 지나가는 지점일 뿐입니다.', 'activity', 'rare', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '시작과 포기 사이의 거리가 아주 멀어졌습니다.', 'activity', 'epic', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('작심삼일의 파괴자', '그만두는 쪽이 오히려 어려운 사람이 있습니다.', 'activity', 'mystic', NULL, 'walking:S1', 28, '{"activity_type":"walking","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S2 · 열흘의 리듬 — 10일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('열흘의 리듬', '열흘이면 습관이라 불러도 됩니다.', 'activity', 'rare', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('열흘의 리듬', '한 번 붙은 리듬은 좀처럼 끊기지 않습니다.', 'activity', 'epic', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('열흘의 리듬', '습관이라는 말로는 부족한 자리에 와 있습니다.', 'activity', 'mystic', NULL, 'walking:S2', 29, '{"activity_type":"walking","streak_days":10,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:S3 · 한 달의 궤도 — 30일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('한 달의 궤도', '한 달을 하루도 끊지 않았습니다.', 'activity', 'epic', NULL, 'walking:S3', 30, '{"activity_type":"walking","streak_days":30,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한 달의 궤도', '화이트 룸은 궤도를 벗어난 적 없는 사람에게 열립니다.', 'activity', 'mystic', NULL, 'walking:S3', 30, '{"activity_type":"walking","streak_days":30,"repeat_count":2}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B1 · 자기 초월 — 가장 긴 거리 갱신
    ('자기 초월', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '최고 기록이 한 번 더 뒤로 밀려났습니다.', 'activity', NULL, 2, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '지난 기록을 넘어서는 일이 낯설지 않게 되었습니다.', 'activity', NULL, 3, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '이제 겨루는 상대는 기록표의 맨 윗줄뿐입니다.', 'activity', NULL, 4, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '기록을 고쳐 쓸 때마다 넘어야 할 선도 함께 올라갑니다.', 'activity', NULL, 5, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '블랙 트랙의 기록판이 자주 고쳐 쓰입니다.', 'activity', NULL, 6, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '스스로 세운 벽만 남았습니다.', 'activity', NULL, 7, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('자기 초월', '넘어설 상대가 더는 남아 있지 않습니다.', 'activity', NULL, 8, 'walking:B1', 31, '{"activity_type":"walking","personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B2 · 더 오래 — 가장 긴 이동시간 갱신
    --   [근사] 「최장 이동시간 갱신」과 「최장 거리 갱신」(B1)을 구분할 지표 지정 수단이 없다
    ('더 오래', '시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.', 'activity', NULL, 1, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '멈추고 싶어지는 지점이 조금씩 뒤로 밀립니다.', 'activity', NULL, 2, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '오래 견디는 일에도 요령이 생겼습니다.', 'activity', NULL, 3, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시계를 보지 않아도 시간이 늘어납니다.', 'activity', NULL, 4, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '길어진 시간은 체력보다 태도에서 나옵니다.', 'activity', NULL, 5, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '끝을 정하지 않는 쪽이 더 멀리 갑니다.', 'activity', NULL, 6, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '시간은 이제 한계가 아니라 재료입니다.', 'activity', NULL, 7, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('더 오래', '머무는 법을 아는 사람에게 끝은 없습니다.', 'activity', NULL, 8, 'walking:B2', 32, '{"activity_type":"walking","personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B3 · 지난달의 나에게 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 나에게', '지난달의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달의 기록이 이번 달의 출발선이 되었습니다.', 'activity', NULL, 2, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '달이 바뀔 때마다 기준선도 함께 올라갑니다.', 'activity', NULL, 3, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '지난달을 넘기는 일이 계획의 일부가 되었습니다.', 'activity', NULL, 4, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '조금씩 올려 둔 선이 어느새 높은 곳에 있습니다.', 'activity', NULL, 5, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '뒤를 돌아보면 지난달이 아득합니다.', 'activity', NULL, 6, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '견줄 대상은 언제나 한 달 전의 자신뿐입니다.', 'activity', NULL, 7, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('지난달의 나에게', '이 곡선은 아래로 꺾인 적이 없습니다.', 'activity', NULL, 8, 'walking:B3', 33, '{"activity_type":"walking","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
    -- walking:B4 · 평균의 배신 — 한 번에 평소 평균 거리의 2배 이상
    ('평균의 배신', '평소의 두 배를 한 번에 걸었습니다.', 'activity', NULL, 1, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":1}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평소의 폭을 벗어난 날이 한 번 더 생겼습니다.', 'activity', NULL, 2, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":2}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평균이라는 말이 점점 헐거워집니다.', 'activity', NULL, 3, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":3}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '예외였던 날이 이제는 기준을 흔듭니다.', 'activity', NULL, 4, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":4}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평균은 더 이상 이 사람을 설명하지 못합니다.', 'activity', NULL, 5, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":5}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '튀는 날이 잦아지면 그건 예외가 아닙니다.', 'activity', NULL, 6, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":6}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '블랙 트랙은 평균 밖으로 나온 사람만 받아들입니다.', 'activity', NULL, 7, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":7}'::jsonb, ARRAY['walking']::text[]),
    ('평균의 배신', '평균이 뒤따라오느라 매번 늦습니다.', 'activity', NULL, 8, 'walking:B4', 34, '{"activity_type":"walking","vs_personal_average":2,"personal_record_break":8}'::jsonb, ARRAY['walking']::text[]),
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
    ('완전한 하루', '쉬는 날을 미리 정해 두는 사람이 오래 갑니다.', 'activity', 'epic', NULL, 'walking:R1', 40, '{"activity_type":"walking","streak_days":6,"rest_after_streak":1,"repeat_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('완전한 하루', '비워 둔 하루가 나머지 날들을 지탱합니다.', 'activity', 'mystic', NULL, 'walking:R1', 40, '{"activity_type":"walking","streak_days":6,"rest_after_streak":1,"repeat_count":20}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R2 · 회복의 기술 — 한 번에 90분 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long
    --   [근사] 「90분 이상 활동 다음 날 휴식」 — rest_after_long의 짝 필드가 single_distance_km 하나뿐이라 duration_minutes와 짝지을 수 없다
    ('회복의 기술', '길게 걸은 다음 날을 비워두는 법을 압니다.', 'activity', 'common', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '긴 하루 뒤의 공백이 자연스러운 순서가 되었습니다.', 'activity', 'rare', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '회복은 미루는 일이 아니라 배치하는 일입니다.', 'activity', 'epic', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['walking']::text[]),
    ('회복의 기술', '무리와 회복 사이의 간격을 몸이 먼저 계산합니다.', 'activity', 'mystic', NULL, 'walking:R2', 41, '{"activity_type":"walking","duration_minutes":90,"rest_after_long":1,"repeat_count":100}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R3 · 쉬는 것도 훈련 — 4주(월~일) 연속 매주 1일 이상 휴식 / 1회
    --   [회차] 미소비 키 weekly_streak
    --   [근사] 「매주 하루 이상 휴식」을 표현할 수 없다 — 연속 주(weekly_streak)로만 근사
    ('쉬는 것도 훈련', '네 주 동안 쉬는 날을 한 번도 건너뛰지 않았습니다.', 'activity', 'rare', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('쉬는 것도 훈련', '쉬는 날을 지키는 데에도 규율이 필요합니다.', 'activity', 'epic', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('쉬는 것도 훈련', '멈출 줄 아는 사람만 멀리까지 갑니다.', 'activity', 'mystic', NULL, 'walking:R3', 42, '{"activity_type":"walking","weekly_streak":4,"repeat_count":12}'::jsonb, ARRAY['walking']::text[]),
    -- walking:R4 · 겨울잠 — 14일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('겨울잠', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('겨울잠', '멀어졌다가 돌아오는 길을 이미 알고 있습니다.', 'activity', 'rare', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":3}'::jsonb, ARRAY['walking']::text[]),
    ('겨울잠', '몇 번을 떠나도 결국 같은 자리로 돌아옵니다.', 'activity', 'epic', NULL, 'walking:R4', 43, '{"activity_type":"walking","return_gap_days":14,"repeat_count":10}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W1 · 한여름의 보행자 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 보행자', '가장 더운 두 달에도 걸음을 멈추지 않았습니다.', 'activity', 'common', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '더위를 핑계로 삼지 않는 여름이 이어집니다.', 'activity', 'rare', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":5}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '블랙 트랙은 한여름의 아스팔트 위에서 가장 선명해집니다.', 'activity', 'epic', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('한여름의 보행자', '폭염은 이 사람의 일정에서 아무것도 지우지 못합니다.', 'activity', 'mystic', NULL, 'walking:W1', 44, '{"activity_type":"walking","month":[7,8],"total_count":50}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W2 · 한겨울의 보행자 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 보행자', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'rare', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('한겨울의 보행자', '블랙 트랙의 겨울 구간은 견딘 사람만 통과합니다.', 'activity', 'epic', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":20}'::jsonb, ARRAY['walking']::text[]),
    ('한겨울의 보행자', '추위가 물러설 때까지 자리를 지킨 사람입니다.', 'activity', 'mystic', NULL, 'walking:W2', 45, '{"activity_type":"walking","month":[12,1,2],"total_count":60}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W3 · 사계절의 발걸음 — 네 계절 각 10회 / 1회
    ('사계절의 발걸음', '일 년을 네 조각으로 나눠 모두 걸었습니다.', 'activity', 'epic', NULL, 'walking:W3', 46, '{"activity_type":"walking","season_count_all":10}'::jsonb, ARRAY['walking']::text[]),
    ('사계절의 발걸음', '한 해의 어느 계절에도 빈자리가 없습니다.', 'activity', 'mystic', NULL, 'walking:W3', 46, '{"activity_type":"walking","season_count_all":20}'::jsonb, ARRAY['walking']::text[]),
    -- walking:W4 · 장마의 의지 — 6~7월 중 한 달에 80km
    --   [필터] month + monthly_km
    --   [회차] 미소비 키 month·monthly_km
    ('장마의 의지', '빗소리를 배경음으로 한 달을 채웠습니다.', 'activity', 'epic', NULL, 'walking:W4', 47, '{"activity_type":"walking","month":[6,7],"monthly_km":80,"repeat_count":1}'::jsonb, ARRAY['walking']::text[]),
    ('장마의 의지', '비가 그치기를 기다린 달은 한 번도 없습니다.', 'activity', 'mystic', NULL, 'walking:W4', 47, '{"activity_type":"walking","month":[6,7],"monthly_km":80,"repeat_count":2}'::jsonb, ARRAY['walking']::text[]),
    -- running:K1 · 달려온 거리 — 누적 거리 20km
    ('달려온 거리', '발이 지나온 길이는 지도보다 몸이 먼저 압니다.', 'activity', NULL, 1, 'running:K1', 1, '{"activity_type":"running","distance_km":20}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '지나온 길이 지도 위에서 한 뼘쯤 늘었습니다.', 'activity', NULL, 2, 'running:K1', 1, '{"activity_type":"running","distance_km":60}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '익숙한 길만 돌아서는 이 길이가 나오지 않습니다.', 'activity', NULL, 3, 'running:K1', 1, '{"activity_type":"running","distance_km":150}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '도시 하나를 통째로 가로지른 길이입니다.', 'activity', NULL, 4, 'running:K1', 1, '{"activity_type":"running","distance_km":320}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '지도를 펴야 가늠이 되는 거리에 들어섰습니다.', 'activity', NULL, 5, 'running:K1', 1, '{"activity_type":"running","distance_km":600}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '여기부터는 거리를 세는 단위가 달라집니다.', 'activity', NULL, 6, 'running:K1', 1, '{"activity_type":"running","distance_km":1100}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '지도 밖으로 나간 거리입니다.', 'activity', NULL, 7, 'running:K1', 1, '{"activity_type":"running","distance_km":1900}'::jsonb, ARRAY['running']::text[]),
    ('달려온 거리', '여기까지 온 발에는 설명이 필요 없습니다.', 'activity', NULL, 8, 'running:K1', 1, '{"activity_type":"running","distance_km":3200}'::jsonb, ARRAY['running']::text[]),
    -- running:K3 · 달린 횟수 — 총 10회
    ('달린 횟수', '몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.', 'activity', NULL, 1, 'running:K3', 2, '{"activity_type":"running","total_count":10}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '나간 날이 안 나간 날보다 많아지기 시작합니다.', 'activity', NULL, 2, 'running:K3', 2, '{"activity_type":"running","total_count":30}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '나갈지 말지를 고민하는 시간이 사라졌습니다.', 'activity', NULL, 3, 'running:K3', 2, '{"activity_type":"running","total_count":60}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '이 정도 횟수는 마음이 아니라 몸이 쌓아 올립니다.', 'activity', NULL, 4, 'running:K3', 2, '{"activity_type":"running","total_count":110}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '반복이 재능을 앞지른 자리입니다.', 'activity', NULL, 5, 'running:K3', 2, '{"activity_type":"running","total_count":190}'::jsonb, ARRAY['running']::text[]),
    ('달린 횟수', '세는 일을 그만둔 사람만 여기 있습니다.', 'activity', NULL, 6, 'running:K3', 2, '{"activity_type":"running","total_count":320}'::jsonb, ARRAY['running']::text[]),
    -- running:P1 · 페이스 메이커 — 한 번에 5km 이상, 6:15/km보다 빠르게
    ('페이스 메이커', '속도는 재능이 아니라 반복이 만든 결과입니다.', 'activity', 'common', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":375}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '반복이 쌓이면 시계가 먼저 달라집니다.', 'activity', 'rare', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":330}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '블랙 트랙의 기록판은 이런 속도부터 이름을 받아 적습니다.', 'activity', 'epic', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":300}'::jsonb, ARRAY['running']::text[]),
    ('페이스 메이커', '여기서부터는 속도가 곧 그 사람의 이름입니다.', 'activity', 'mystic', NULL, 'running:P1', 3, '{"activity_type":"running","single_distance_km":5,"max_pace_sec_per_km":270}'::jsonb, ARRAY['running']::text[]),
    -- running:L1 · 긴 하루 — 한 번에 15km
    ('긴 하루', '한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.', 'activity', 'common', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":15}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '그릇의 크기가 한 번 늘어나면 되돌아가지 않습니다.', 'activity', 'rare', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":21}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '한 번에 이만큼 가는 일은 각오의 문제가 됩니다.', 'activity', 'epic', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":32}'::jsonb, ARRAY['running']::text[]),
    ('긴 하루', '화이트 룸은 끝까지 가본 사람에게만 문을 엽니다.', 'activity', 'mystic', NULL, 'running:L1', 4, '{"activity_type":"running","single_distance_km":42}'::jsonb, ARRAY['running']::text[]),
    -- running:C1 · 오늘의 한 발 — 하루 1회 / 1회
    ('오늘의 한 발', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":1}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '하루씩 쌓은 것이 이제 눈에 보이는 크기가 되었습니다.', 'activity', 'rare', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":30}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '빠짐없이 이어온 하루가 그 사람의 성격이 되었습니다.', 'activity', 'epic', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":100}'::jsonb, ARRAY['running']::text[]),
    ('오늘의 한 발', '여기까지 하루를 지켜낸 이름은 지워지지 않습니다.', 'activity', 'mystic', NULL, 'running:C1', 5, '{"activity_type":"running","active_days_count":300}'::jsonb, ARRAY['running']::text[]),
    -- running:C2 · 이번 주의 페이스 — 한 주(월~일)에 4회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 페이스', '네 번을 채운 주에는 몸이 먼저 알아차립니다.', 'activity', 'common', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '채운 주가 겹치기 시작하면 한 주의 모양이 달라집니다.', 'activity', 'rare', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":8}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '어떤 주가 와도 흔들리지 않는 리듬을 가졌습니다.', 'activity', 'epic', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":26}'::jsonb, ARRAY['running']::text[]),
    ('이번 주의 페이스', '한 주를 채우는 일은 더는 사건이 아닙니다.', 'activity', 'mystic', NULL, 'running:C2', 6, '{"activity_type":"running","weekly_count":4,"repeat_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:C3 · 이달의 러닝 — 한 달에 120km
    ('이달의 러닝', '한 달을 통째로 달린 총량이 여기 남습니다.', 'activity', 'common', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":120}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '달마다 남는 총량이 조금씩 무거워집니다.', 'activity', 'rare', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":217}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '한 달 치의 거리를 감당하는 몸은 따로 만들어집니다.', 'activity', 'epic', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":350}'::jsonb, ARRAY['running']::text[]),
    ('이달의 러닝', '이 정도의 달을 반복하는 몸은 이미 다른 종류입니다.', 'activity', 'mystic', NULL, 'running:C3', 7, '{"activity_type":"running","monthly_km":550}'::jsonb, ARRAY['running']::text[]),
    -- running:C4 · 계절의 러너 — 한 계절에 400km
    --   [필터] season + distance_km
    ('계절의 러너', '계절 하나를 달려서 통과했습니다.', 'activity', 'common', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":400}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '계절이 바뀌는 자리마다 같은 발자국이 겹칩니다.', 'activity', 'rare', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":650}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '여러 계절이 한 줄로 이어진 궤적이 남습니다.', 'activity', 'epic', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":1100}'::jsonb, ARRAY['running']::text[]),
    ('계절의 러너', '계절이 몇 번을 지나가도 이 기록은 자리를 지킵니다.', 'activity', 'mystic', NULL, 'running:C4', 8, '{"activity_type":"running","season":"all","distance_km":1700}'::jsonb, ARRAY['running']::text[]),
    -- running:T1 · 새벽의 러너 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 러너', '해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.', 'activity', 'common', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '그루터기 살롱의 새벽 손님들은 서로를 알아봅니다.', 'activity', 'rare', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":15}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '첫차보다 먼저 움직이는 사람은 도시의 다른 얼굴을 봅니다.', 'activity', 'epic', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    ('새벽의 러너', '해가 뜨기 전의 도시는 이 사람의 것입니다.', 'activity', 'mystic', NULL, 'running:T1', 9, '{"activity_type":"running","time_range":{"start":"05:00","end":"08:00"},"total_count":120}'::jsonb, ARRAY['running']::text[]),
    -- running:T2 · 밤의 러너 — 저녁 8시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 러너', '하루를 끝낸 몸으로 다시 시작하는 사람입니다.', 'activity', 'common', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '불 꺼진 거리에도 익숙한 코스가 생겼습니다.', 'activity', 'rare', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":15}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '밤이 깊을수록 발이 가벼워지는 사람이 있습니다.', 'activity', 'epic', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    ('밤의 러너', '밤을 자기 편으로 만든 사람은 아침을 기다리지 않습니다.', 'activity', 'mystic', NULL, 'running:T2', 10, '{"activity_type":"running","time_range":{"start":"20:00","end":"05:00"},"total_count":120}'::jsonb, ARRAY['running']::text[]),
    -- running:T3 · 해와 달의 주자 — 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회
    --   [필터] time_range + total_count
    --   [근사] A2와 같은 근사
    ('해와 달의 주자', '같은 하루의 양 끝을 모두 달렸습니다.', 'activity', 'common', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '하루의 처음과 끝을 같은 신발로 지납니다.', 'activity', 'rare', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '낮과 밤 어느 쪽도 이 사람을 비켜 가지 않습니다.', 'activity', 'epic', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('해와 달의 주자', '하루의 양 끝이 하나로 이어졌습니다.', 'activity', 'mystic', NULL, 'running:T3', 11, '{"activity_type":"running","time_range":{"start":"20:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:D1 · 월요일의 시작 — 월요일 / 1회
    --   [필터] day_of_week + total_count
    ('월요일의 시작', '한 주의 첫 단추를 달리기로 채웠습니다.', 'activity', 'common', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '월요일 아침을 두려워하지 않는 쪽이 되었습니다.', 'activity', 'rare', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":10}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '한 주의 첫날은 이 사람에게 늘 같은 자리입니다.', 'activity', 'epic', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":30}'::jsonb, ARRAY['running']::text[]),
    ('월요일의 시작', '월요일은 오래전부터 이 사람의 것입니다.', 'activity', 'mystic', NULL, 'running:D1', 12, '{"activity_type":"running","day_of_week":"monday","total_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:D2 · 주말 장거리 — 주말에 한 번에 10km 이상 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사 — 토·일 각각 N회를 요구한다
    ('주말 장거리', '쉬는 날에 가장 멀리 가는 사람이 있습니다.', 'activity', 'common', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '주말이 오면 어디까지 갈지부터 정합니다.', 'activity', 'rare', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":8}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '이 사람의 주말은 쉬는 날로 분류되지 않습니다.', 'activity', 'epic', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":25}'::jsonb, ARRAY['running']::text[]),
    ('주말 장거리', '주말마다 도시 끝까지 다녀오는 일이 예삿일이 되었습니다.', 'activity', 'mystic', NULL, 'running:D2', 13, '{"activity_type":"running","day_of_week":["saturday","sunday"],"single_distance_km":10,"total_count":52}'::jsonb, ARRAY['running']::text[]),
    -- running:N1 · 사흘의 리듬 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 리듬', '사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.', 'activity', 'common', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '무거운 아침이 반복되면 그것도 리듬이 됩니다.', 'activity', 'rare', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '사흘을 잇는 일에 더 이상 의지가 들지 않습니다.', 'activity', 'epic', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['running']::text[]),
    ('사흘의 리듬', '이어 붙인 사흘이 셀 수 없이 겹쳤습니다.', 'activity', 'mystic', NULL, 'running:N1', 14, '{"activity_type":"running","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:N2 · 일주일의 궤도 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'common', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('일주일의 궤도', '건너뛰지 않은 한 주가 다시 돌아옵니다.', 'activity', 'rare', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['running']::text[]),
    ('일주일의 궤도', '하루도 비지 않은 주가 이 사람에게는 기본값입니다.', 'activity', 'epic', NULL, 'running:N2', 15, '{"activity_type":"running","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    -- running:N3 · 런 스트릭 — 30일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('런 스트릭', '매일 달리는 사람들의 오래된 전통에 합류했습니다.', 'activity', 'epic', NULL, 'running:N3', 16, '{"activity_type":"running","streak_days":30,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('런 스트릭', '여기서는 쉬었다는 기록조차 남지 않습니다.', 'activity', 'mystic', NULL, 'running:N3', 16, '{"activity_type":"running","streak_days":30,"repeat_count":2}'::jsonb, ARRAY['running']::text[]),
    -- running:R1 · 발끝의 한계 — 가장 긴 거리 갱신
    ('발끝의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'running:R1', 17, '{"activity_type":"running","personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '어제를 한 번 넘어선 사람은 그 자리로 돌아가지 않습니다.', 'activity', NULL, 2, 'running:R1', 17, '{"activity_type":"running","personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '이기는 일이 우연이 아니라는 걸 확인했습니다.', 'activity', NULL, 3, 'running:R1', 17, '{"activity_type":"running","personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '넘어설 대상이 늘 자기 자신뿐입니다.', 'activity', NULL, 4, 'running:R1', 17, '{"activity_type":"running","personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '기록을 갈아 끼우는 일이 일상의 한 줄이 되었습니다.', 'activity', NULL, 5, 'running:R1', 17, '{"activity_type":"running","personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '한계라고 불렀던 자리가 이제 출발선입니다.', 'activity', NULL, 6, 'running:R1', 17, '{"activity_type":"running","personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '화이트 룸의 문은 이 지점에서 열립니다.', 'activity', NULL, 7, 'running:R1', 17, '{"activity_type":"running","personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('발끝의 한계', '넘어설 것이 남아 있지 않습니다.', 'activity', NULL, 8, 'running:R1', 17, '{"activity_type":"running","personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
    -- running:R2 · 더 빠르게 — 5km 이상 활동의 가장 빠른 페이스 갱신
    --   [근사] 「5km 이상 활동의 최고 페이스 갱신」 — 지표 지정 수단이 없어 single_distance_km로 대상만 좁혔다
    ('더 빠르게', '같은 거리를 더 짧은 시간에 통과했습니다.', 'activity', NULL, 1, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 길에서 초 단위가 줄어들기 시작합니다.', 'activity', NULL, 2, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '한 번 줄어든 시간은 다시 늘어나지 않습니다.', 'activity', NULL, 3, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리가 매번 다른 시간으로 끝납니다.', 'activity', NULL, 4, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '시계를 이기는 방법을 몸이 외웠습니다.', 'activity', NULL, 5, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '더 줄일 곳을 찾아내는 눈이 생겼습니다.', 'activity', NULL, 6, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '같은 거리에서 뺏어올 시간이 얼마 남지 않았습니다.', 'activity', NULL, 7, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('더 빠르게', '이 시간을 다시 줄일 사람은 자신뿐입니다.', 'activity', NULL, 8, 'running:R2', 18, '{"activity_type":"running","single_distance_km":5,"personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
    -- running:R3 · 지난달의 주자 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 주자', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '지난달을 넘기는 일이 한 번으로 끝나지 않았습니다.', 'activity', NULL, 2, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '달이 바뀔 때마다 기준선이 올라갑니다.', 'activity', NULL, 3, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '지난달의 자신은 이제 상대가 되지 않습니다.', 'activity', NULL, 4, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '늘어난 만큼을 감당하는 몸이 뒤따라왔습니다.', 'activity', NULL, 5, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '매달 올라가는 곡선을 스스로 그리고 있습니다.', 'activity', NULL, 6, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '이 상승을 계속 버티는 쪽이 더 어렵습니다.', 'activity', NULL, 7, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['running']::text[]),
    ('지난달의 주자', '비교할 지난달이 남아 있지 않습니다.', 'activity', NULL, 8, 'running:R3', 19, '{"activity_type":"running","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['running']::text[]),
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
    ('비워둔 하루', '비워 둔 하루가 다음 며칠을 지탱합니다.', 'activity', 'rare', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":5}'::jsonb, ARRAY['running']::text[]),
    ('비워둔 하루', '언제 멈춰야 하는지를 아는 쪽이 오래 갑니다.', 'activity', 'epic', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":20}'::jsonb, ARRAY['running']::text[]),
    ('비워둔 하루', '이 여백은 실수가 아니라 설계입니다.', 'activity', 'mystic', NULL, 'running:X1', 25, '{"activity_type":"running","streak_days":5,"rest_after_streak":1,"repeat_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:X2 · 다음 날의 여백 — 한 번에 25km 이상 다음 날 휴식 / 1회
    --   [회차] 휴식 조건(rest_after_long)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 rest_after_long·single_distance_km
    ('다음 날의 여백', '길게 달린 뒤에 무엇을 하지 않을지 아는 사람입니다.', 'activity', 'common', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('다음 날의 여백', '먼 거리를 다녀온 다음 날까지가 하나의 계획에 들어 있습니다.', 'activity', 'rare', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('다음 날의 여백', '회복까지 계획에 넣은 사람은 무너지지 않습니다.', 'activity', 'epic', NULL, 'running:X2', 26, '{"activity_type":"running","single_distance_km":25,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    -- running:X3 · 돌아온 러너 — 14일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 러너', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('돌아온 러너', '그루터기 살롱은 돌아온 사람에게 자리를 비워 둡니다.', 'activity', 'rare', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":3}'::jsonb, ARRAY['running']::text[]),
    ('돌아온 러너', '몇 번을 멈춰도 다시 돌아오는 쪽이 결국 남습니다.', 'activity', 'epic', NULL, 'running:X3', 27, '{"activity_type":"running","return_gap_days":14,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    -- running:W1 · 한여름의 러너 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 러너', '가장 더운 두 달에도 발을 멈추지 않았습니다.', 'activity', 'common', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '더위는 핑계 목록에서 빠진 지 오래입니다.', 'activity', 'rare', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '블랙 트랙은 폭염 속에서도 문을 닫지 않습니다.', 'activity', 'epic', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('한여름의 러너', '여름은 이 사람을 막지 못했습니다.', 'activity', 'mystic', NULL, 'running:W1', 28, '{"activity_type":"running","month":[7,8],"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:W2 · 한겨울의 러너 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 러너', '숨이 하얗게 보이는 날에도 나섰습니다.', 'activity', 'common', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '찬 공기에 맞는 옷차림과 시간대를 이미 압니다.', 'activity', 'rare', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":5}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '한파는 이 사람의 일정표를 바꾸지 못합니다.', 'activity', 'epic', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":20}'::jsonb, ARRAY['running']::text[]),
    ('한겨울의 러너', '겨울이 길수록 이 사람의 기록은 두꺼워집니다.', 'activity', 'mystic', NULL, 'running:W2', 29, '{"activity_type":"running","month":[12,1,2],"total_count":50}'::jsonb, ARRAY['running']::text[]),
    -- running:W3 · 사계절의 주자 — 네 계절 각 10회 / 1회
    ('사계절의 주자', '일 년을 네 조각으로 나눠 모두 달렸습니다.', 'activity', 'epic', NULL, 'running:W3', 30, '{"activity_type":"running","season_count_all":10}'::jsonb, ARRAY['running']::text[]),
    ('사계절의 주자', '어느 계절도 이 사람을 쉬게 하지 못했습니다.', 'activity', 'mystic', NULL, 'running:W3', 30, '{"activity_type":"running","season_count_all":20}'::jsonb, ARRAY['running']::text[]),
    -- running:H1 · 심박의 주인 — 한 번에 30분 이상, 평균 심박 160bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('심박의 주인', '심장이 어디까지 견디는지 아는 사람입니다.', 'activity', 'common', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '견딜 수 있는 자리에 스스로 머무는 법을 익혔습니다.', 'activity', 'rare', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '높은 심박을 오래 끌고 가는 일은 훈련의 영역입니다.', 'activity', 'epic', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    ('심박의 주인', '화이트 룸은 심장이 한계에 닿는 순간을 기억합니다.', 'activity', 'mystic', NULL, 'running:H1', 31, '{"activity_type":"running","avg_heartrate_bpm":160,"duration_minutes":30,"repeat_count":100}'::jsonb, ARRAY['running']::text[]),
    -- running:H2 · 180의 리듬 — 평균 케이던스 180spm 이상 / 1회
    --   [회차] 미소비 키 avg_cadence
    ('180의 리듬', '발이 땅에 닿는 간격까지 관리하는 단계입니다.', 'activity', 'common', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":1}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '간격이 흐트러지는 순간을 스스로 알아차립니다.', 'activity', 'rare', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":10}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '리듬이 무너지지 않는 몸은 소리부터 다릅니다.', 'activity', 'epic', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":30}'::jsonb, ARRAY['running']::text[]),
    ('180의 리듬', '이 박자는 이제 의식하지 않아도 유지됩니다.', 'activity', 'mystic', NULL, 'running:H2', 32, '{"activity_type":"running","avg_cadence":180,"repeat_count":100}'::jsonb, ARRAY['running']::text[]),
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
    ('굴러온 거리', '지도 위에 지나온 자리가 눈에 보이기 시작합니다.', 'activity', NULL, 2, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":250}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '익숙한 길이 줄고 처음 보는 길이 늘어납니다.', 'activity', NULL, 3, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":600}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '지나온 길이가 도시 하나의 크기를 넘어섭니다.', 'activity', NULL, 4, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":1300}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '이제 지명을 거리로 기억합니다.', 'activity', NULL, 5, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":2500}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '지도의 축척을 바꿔야 전부 들어옵니다.', 'activity', NULL, 6, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":4200}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '남은 길이 지나온 길보다 짧습니다.', 'activity', NULL, 7, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":8000}'::jsonb, ARRAY['cycling']::text[]),
    ('굴러온 거리', '거리는 더 이상 이 사람을 설명하지 못합니다.', 'activity', NULL, 8, 'cycling:K1', 1, '{"activity_type":"cycling","distance_km":14000}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:K2 · 바퀴로 오른 고도 — 누적 상승고도 1,000m
    ('바퀴로 오른 고도', '평지만 달렸다면 이 숫자는 오르지 않습니다.', 'activity', NULL, 1, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":1000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '오르막을 골라 나서는 날이 생깁니다.', 'activity', NULL, 2, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":3000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '그루터기 살롱의 단골들이 사는 높이에 닿습니다.', 'activity', NULL, 3, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":8000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '올라간 높이가 산맥의 단위로 세어집니다.', 'activity', NULL, 4, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":22000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '정상은 목적지가 아니라 통과 지점이 됩니다.', 'activity', NULL, 5, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":38000}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴로 오른 고도', '이 사람 위로 남은 높이가 많지 않습니다.', 'activity', NULL, 6, 'cycling:K2', 2, '{"activity_type":"cycling","elevation_gain_m":70000}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:K3 · 안장에 오른 횟수 — 총 8회
    ('안장에 오른 횟수', '얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.', 'activity', NULL, 1, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '나서는 일이 결심에서 순서로 바뀝니다.', 'activity', NULL, 2, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":25}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '날씨를 확인하는 이유가 취소가 아니라 준비로 바뀝니다.', 'activity', NULL, 3, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":55}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '나섰다는 사실만으로 채워진 기록이 두꺼워집니다.', 'activity', NULL, 4, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":100}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '결심이라는 단어가 필요 없어집니다.', 'activity', NULL, 5, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":170}'::jsonb, ARRAY['cycling']::text[]),
    ('안장에 오른 횟수', '나서지 않은 날을 세는 편이 빠릅니다.', 'activity', NULL, 6, 'cycling:K3', 3, '{"activity_type":"cycling","total_count":280}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:P1 · 속도의 주인 — 한 번에 30km 이상, 평균 속도 22km/h 이상
    ('속도의 주인', '평균 속도는 다리보다 페이스 감각이 만듭니다.', 'activity', 'common', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":22}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '감각이 붙으면 속도계를 덜 보게 됩니다.', 'activity', 'rare', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":25}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '바람이 정면일 때에도 평균이 무너지지 않습니다.', 'activity', 'epic', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":28}'::jsonb, ARRAY['cycling']::text[]),
    ('속도의 주인', '이 속도는 이제 최고가 아니라 기본값입니다.', 'activity', 'mystic', NULL, 'cycling:P1', 4, '{"activity_type":"cycling","single_distance_km":30,"min_speed_kmh":32}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:V1 · 다운힐 — 한 번에 최고 속도 45km/h 이상
    ('다운힐', '내리막에서 브레이크를 놓아본 적이 있습니다.', 'activity', 'common', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":45}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '손가락이 레버에서 떨어져 있는 시간이 길어집니다.', 'activity', 'rare', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":55}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '블랙 트랙의 내리막은 이런 사람에게만 길을 내줍니다.', 'activity', 'epic', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":65}'::jsonb, ARRAY['cycling']::text[]),
    ('다운힐', '속도계의 맨 윗칸은 이 사람의 자리입니다.', 'activity', 'mystic', NULL, 'cycling:V1', 5, '{"activity_type":"cycling","max_speed_kmh":75}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:L1 · 안장 위의 하루 — 한 번에 80km
    ('안장 위의 하루', '해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.', 'activity', 'common', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":80}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '하루를 통째로 쓰는 일정에 익숙해집니다.', 'activity', 'rare', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":120}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '해가 지고도 남은 거리를 침착하게 계산합니다.', 'activity', 'epic', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":160}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 하루', '하루의 길이가 이 사람의 거리를 정하지 못합니다.', 'activity', 'mystic', NULL, 'cycling:L1', 6, '{"activity_type":"cycling","single_distance_km":200}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:E1 · 언덕의 사람 — 한 번에 상승고도 500m 이상
    ('언덕의 사람', '오르막을 피하지 않는 사람이 따로 있습니다.', 'activity', 'common', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":500}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '그루터기 살롱의 단골들은 오르막 초입에서 이 사람을 알아봅니다.', 'activity', 'rare', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":1000}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '경사도가 아니라 남은 거리만 봅니다.', 'activity', 'epic', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":1600}'::jsonb, ARRAY['cycling']::text[]),
    ('언덕의 사람', '화이트 룸은 정상보다 그 앞의 마지막 굽이를 기억합니다.', 'activity', 'mystic', NULL, 'cycling:E1', 7, '{"activity_type":"cycling","single_elevation_m":2500}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C1 · 오늘의 바퀴 — 하루 1회 / 1회
    ('오늘의 바퀴', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '하루치가 여러 달로 불어나면 그것을 습관이라고 부릅니다.', 'activity', 'rare', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":25}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '달력에 남은 날들이 그대로 기록의 두께가 됩니다.', 'activity', 'epic', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":80}'::jsonb, ARRAY['cycling']::text[]),
    ('오늘의 바퀴', '이만큼 쌓인 날수 앞에서는 컨디션이라는 말이 무력합니다.', 'activity', 'mystic', NULL, 'cycling:C1', 8, '{"activity_type":"cycling","active_days_count":250}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C2 · 이번 주의 바퀴 — 한 주(월~일)에 3회 / 1회
    --   [회차] 미소비 키 weekly_count
    ('이번 주의 바퀴', '세 번을 채운 주에는 다리가 먼저 알아차립니다.', 'activity', 'common', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '채운 주가 이어지면 일정표가 먼저 자리를 비워둡니다.', 'activity', 'rare', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '한 주를 무너뜨리지 않는 사람은 계절도 무너지지 않습니다.', 'activity', 'epic', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":26}'::jsonb, ARRAY['cycling']::text[]),
    ('이번 주의 바퀴', '이제 주간 계획이 이 사람을 따라옵니다.', 'activity', 'mystic', NULL, 'cycling:C2', 9, '{"activity_type":"cycling","weekly_count":3,"repeat_count":52}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C3 · 이달의 라이더 — 한 달에 400km
    ('이달의 라이더', '한 달의 총량은 하루의 컨디션을 이깁니다.', 'activity', 'common', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":400}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '총량이 커질수록 잘 탄 날과 못 탄 날의 차이가 흐려집니다.', 'activity', 'rare', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":867}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '한 달이라는 단위가 이 사람에게는 짧습니다.', 'activity', 'epic', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":1400}'::jsonb, ARRAY['cycling']::text[]),
    ('이달의 라이더', '화이트 룸은 한 달을 통째로 밀어붙인 자를 알아봅니다.', 'activity', 'mystic', NULL, 'cycling:C3', 10, '{"activity_type":"cycling","monthly_km":2200}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:C4 · 계절의 라이더 — 한 계절에 1,300km
    --   [필터] season + distance_km
    ('계절의 라이더', '계절 하나를 바퀴로 통과했습니다.', 'activity', 'common', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":1300}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '지나온 계절이 늘수록 날씨는 변명이 되지 못합니다.', 'activity', 'rare', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":2600}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '봄과 겨울을 같은 태도로 지나온 기록이 남습니다.', 'activity', 'epic', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":4200}'::jsonb, ARRAY['cycling']::text[]),
    ('계절의 라이더', '계절은 이 사람 앞에서 배경으로 물러납니다.', 'activity', 'mystic', NULL, 'cycling:C4', 11, '{"activity_type":"cycling","season":"all","distance_km":6500}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:D1 · 주말 라이더 — 주말 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사
    ('주말 라이더', '주말의 도로는 이 사람들의 것입니다.', 'activity', 'common', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '토요일 아침이 늦잠보다 먼저 정해져 있습니다.', 'activity', 'rare', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '이틀이라는 짧은 창을 이만큼 크게 쓰는 경우는 드뭅니다.', 'activity', 'epic', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":35}'::jsonb, ARRAY['cycling']::text[]),
    ('주말 라이더', '주말이라는 말이 더 이상 휴식과 붙어 다니지 않습니다.', 'activity', 'mystic', NULL, 'cycling:D1', 12, '{"activity_type":"cycling","day_of_week":["saturday","sunday"],"total_count":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:D2 · 평일의 반란 — 평일에 한 번에 100km 이상 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「평일」을 요일별 독립 카운터로 근사
    ('평일의 반란', '평일에 100km를 타려면 무언가를 포기해야 합니다.', 'activity', 'common', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '무엇을 포기했는지 이제 아무도 묻지 않습니다.', 'activity', 'rare', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '하루의 절반을 도로에 내주고도 다음 날이 멀쩡합니다.', 'activity', 'epic', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('평일의 반란', '평일과 주말의 경계가 이 사람에게는 없습니다.', 'activity', 'mystic', NULL, 'cycling:D2', 13, '{"activity_type":"cycling","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"single_distance_km":100,"total_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N1 · 사흘의 바퀴 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 바퀴', '사흘 연속은 다리보다 일정이 먼저 무너집니다.', 'activity', 'common', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '무너지지 않은 사흘이 여러 번 겹칩니다.', 'activity', 'rare', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '사흘째의 다리 상태를 미리 아는 사람이 됩니다.', 'activity', 'epic', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('사흘의 바퀴', '연속이라는 말이 더 이상 부담으로 들리지 않습니다.', 'activity', 'mystic', NULL, 'cycling:N1', 14, '{"activity_type":"cycling","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N2 · 일곱 바퀴의 궤도 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일곱 바퀴의 궤도', '일곱 밤을 하루도 건너뛰지 않았습니다.', 'activity', 'common', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('일곱 바퀴의 궤도', '한 주가 통째로 하나의 흐름이 됩니다.', 'activity', 'rare', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('일곱 바퀴의 궤도', '쉬는 날을 끼워 넣지 않고도 다음 주가 이어집니다.', 'activity', 'epic', NULL, 'cycling:N2', 15, '{"activity_type":"cycling","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:N3 · 삼 주의 바퀴 — 21일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('삼 주의 바퀴', '삼 주를 끊지 않는 것은 훈련이 아니라 생활입니다.', 'activity', 'epic', NULL, 'cycling:N3', 16, '{"activity_type":"cycling","streak_days":21,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('삼 주의 바퀴', '생활이 된 것은 좀처럼 무너지지 않습니다.', 'activity', 'mystic', NULL, 'cycling:N3', 16, '{"activity_type":"cycling","streak_days":21,"repeat_count":2}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:G1 · 격주의 약속 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('격주의 약속', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'common', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '약속처럼 돌아오는 간격이 몸에 새겨집니다.', 'activity', 'rare', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '비어도 이상하지 않았을 칸이 한 번도 비지 않았습니다.', 'activity', 'epic', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('격주의 약속', '이 사람의 간격은 달력보다 정확합니다.', 'activity', 'mystic', NULL, 'cycling:G1', 17, '{"activity_type":"cycling","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:R1 · 바퀴의 한계 — 가장 긴 거리 갱신
    ('바퀴의 한계', '어제의 자신을 이기는 일만 남았습니다.', 'activity', NULL, 1, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":1}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '이겨낸 기록이 하나씩 갱신되기 시작합니다.', 'activity', NULL, 2, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":2}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '넘어야 할 상대가 언제나 자기 기록입니다.', 'activity', NULL, 3, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":3}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '기록판을 자기 이름으로 덮어씁니다.', 'activity', NULL, 4, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":4}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '한계라고 불렀던 숫자가 평범해집니다.', 'activity', NULL, 5, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":5}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '경신은 사건이 아니라 과정이 됩니다.', 'activity', NULL, 6, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":6}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '화이트 룸은 이런 사람 앞에서만 열립니다.', 'activity', NULL, 7, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":7}'::jsonb, ARRAY['cycling']::text[]),
    ('바퀴의 한계', '더 이길 상대가 남아 있지 않습니다.', 'activity', NULL, 8, 'cycling:R1', 18, '{"activity_type":"cycling","personal_record_break":8}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:R2 · 지난달의 라이더 — 한 달에 지난달 거리의 120% 이상
    ('지난달의 라이더', '한 달 전의 자신에게 20%를 더 얹었습니다.', 'activity', NULL, 1, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":1}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '지난달의 기록이 이번 달의 최저선이 됩니다.', 'activity', NULL, 2, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":2}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '성장이 우연이 아니었다는 것이 증명됩니다.', 'activity', NULL, 3, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":3}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '매달 다시 시작하는 사람만 그릴 수 있는 곡선입니다.', 'activity', NULL, 4, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":4}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '그래프에 내려가는 구간이 보이지 않습니다.', 'activity', NULL, 5, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":5}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '이 곡선을 유지하는 것은 재능이 아니라 축적입니다.', 'activity', NULL, 6, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":6}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '지난달은 매번 이 사람에게 집니다.', 'activity', NULL, 7, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":7}'::jsonb, ARRAY['cycling']::text[]),
    ('지난달의 라이더', '다음 달의 상대도 이미 정해져 있습니다.', 'activity', NULL, 8, 'cycling:R2', 19, '{"activity_type":"cycling","month_over_month_ratio":1.2,"personal_record_break":8}'::jsonb, ARRAY['cycling']::text[]),
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
    ('안장의 휴일', '비워둔 하루가 다음 출발의 일부라는 것을 압니다.', 'activity', 'rare', NULL, 'cycling:X1', 25, '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('안장의 휴일', '회복을 계획에 넣는 사람이 결국 오래 갑니다.', 'activity', 'epic', NULL, 'cycling:X1', 25, '{"activity_type":"cycling","single_distance_km":150,"rest_after_long":1,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:X2 · 돌아온 라이더 — 30일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 라이더', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('돌아온 라이더', '몇 번을 멈춰도 돌아올 자리가 정해져 있습니다.', 'activity', 'rare', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('돌아온 라이더', '그루터기 살롱은 오래 비운 자리도 치우지 않습니다.', 'activity', 'epic', NULL, 'cycling:X2', 26, '{"activity_type":"cycling","return_gap_days":30,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W1 · 한여름의 라이더 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 라이더', '아스팔트가 달아오른 날에도 나섰습니다.', 'activity', 'common', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '더위는 이제 출발을 미룰 이유가 되지 못합니다.', 'activity', 'rare', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":5}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '블랙 트랙은 도시가 가장 뜨거울 때 입구를 드러냅니다.', 'activity', 'epic', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":20}'::jsonb, ARRAY['cycling']::text[]),
    ('한여름의 라이더', '펄펄 끓는 도로 위에서 이 사람은 예외로 남습니다.', 'activity', 'mystic', NULL, 'cycling:W1', 27, '{"activity_type":"cycling","month":[7,8],"total_count":50}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W2 · 한겨울의 라이더 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 라이더', '손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.', 'activity', 'common', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '드문 쪽에 서는 일이 익숙해집니다.', 'activity', 'rare', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":3}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '영하의 도로에 남은 바퀴 자국은 대개 한 사람의 것입니다.', 'activity', 'epic', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['cycling']::text[]),
    ('한겨울의 라이더', '블랙 트랙의 생존자 명단에 겨울이 적혀 있습니다.', 'activity', 'mystic', NULL, 'cycling:W2', 28, '{"activity_type":"cycling","month":[12,1,2],"total_count":30}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:W3 · 사계절의 라이더 — 네 계절 각 5회 / 1회
    ('사계절의 라이더', '일 년을 네 조각으로 나눠 모두 탔습니다.', 'activity', 'epic', NULL, 'cycling:W3', 29, '{"activity_type":"cycling","season_count_all":5}'::jsonb, ARRAY['cycling']::text[]),
    ('사계절의 라이더', '어떤 계절도 이 사람의 이름을 비워두지 못합니다.', 'activity', 'mystic', NULL, 'cycling:W3', 29, '{"activity_type":"cycling","season_count_all":10}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:H1 · 와트의 주인 — 한 번에 1시간 이상, 평균 파워 200W 이상 / 1회
    --   [회차] 미소비 키 avg_watts
    ('와트의 주인', '출력을 숫자로 관리하는 단계에 들어섰습니다.', 'activity', 'common', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '숫자가 흔들리지 않는 구간이 점점 길어집니다.', 'activity', 'rare', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '출력 그래프가 평평한 사람은 흔치 않습니다.', 'activity', 'epic', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    ('와트의 주인', '파워는 이제 목표가 아니라 이 사람의 평소입니다.', 'activity', 'mystic', NULL, 'cycling:H1', 30, '{"activity_type":"cycling","avg_watts":200,"duration_minutes":60,"repeat_count":100}'::jsonb, ARRAY['cycling']::text[]),
    -- cycling:H2 · 안장 위의 심장 — 한 번에 1시간 이상, 평균 심박 150bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('안장 위의 심장', '다리보다 먼저 한계를 말하는 기관이 있습니다.', 'activity', 'common', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '그 기관이 한계를 말하는 지점이 조금씩 뒤로 밀립니다.', 'activity', 'rare', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":10}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '심박수가 높은 채로 버티는 시간이 훈련의 전부가 됩니다.', 'activity', 'epic', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":30}'::jsonb, ARRAY['cycling']::text[]),
    ('안장 위의 심장', '화이트 룸의 문은 심장이 가장 크게 뛸 때 열립니다.', 'activity', 'mystic', NULL, 'cycling:H2', 31, '{"activity_type":"cycling","avg_heartrate_bpm":150,"duration_minutes":60,"repeat_count":100}'::jsonb, ARRAY['cycling']::text[]),
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
    ('올라온 고도', '쌓인 높이를 확인하는 일이 지도를 펴는 일보다 잦아집니다.', 'activity', NULL, 2, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":5000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '이제 산은 높이의 단위로 셈해집니다.', 'activity', NULL, 3, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":12000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '누적된 상승이 웬만한 고산 하나를 통째로 삼킵니다.', 'activity', NULL, 4, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":25000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '이만한 높이는 하루로 만들어지지 않습니다.', 'activity', NULL, 5, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":48000}'::jsonb, ARRAY['hiking']::text[]),
    ('올라온 고도', '쌓아 올린 높이가 지도의 축척을 벗어납니다.', 'activity', NULL, 6, 'hiking:K1', 1, '{"activity_type":"hiking","elevation_gain_m":85000}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:K3 · 오른 횟수 — 총 5회
    ('오른 횟수', '몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.', 'activity', NULL, 1, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '그루터기 살롱의 주민들이 이 발소리를 기억하기 시작합니다.', 'activity', NULL, 2, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":15}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '들머리에서 마주치는 얼굴들이 먼저 눈인사를 건넵니다.', 'activity', NULL, 3, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '횟수가 쌓이면 산은 더 이상 특별한 일정이 아닙니다.', 'activity', NULL, 4, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":80}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '몇 번째인지 세는 일을 그만둔 지 오래입니다.', 'activity', NULL, 5, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":150}'::jsonb, ARRAY['hiking']::text[]),
    ('오른 횟수', '이 정도는 취미라는 말로 설명되지 않습니다.', 'activity', NULL, 6, 'hiking:K3', 2, '{"activity_type":"hiking","total_count":260}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:P1 · 고도의 사람 — 한 번에 상승고도 500m 이상
    ('고도의 사람', '한 번에 오른 높이가 그 사람의 기준입니다.', 'activity', 'common', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":500}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '하루치 상승만으로 산 하나가 통째로 들어갑니다.', 'activity', 'rare', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":750}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '한 번의 오르막에 하루의 고도를 전부 벌어들입니다.', 'activity', 'epic', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":1200}'::jsonb, ARRAY['hiking']::text[]),
    ('고도의 사람', '화이트 룸의 문은 이런 상승의 끝에서 잠깐 열립니다.', 'activity', 'mystic', NULL, 'hiking:P1', 3, '{"activity_type":"hiking","single_elevation_m":1800}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:A1 · 높은 곳 — 한 번에 최고 도달 고도 700m 이상
    ('높은 곳', '얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.', 'activity', 'common', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":700}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '구름과 같은 높이에 서 본 사람은 등고선을 다르게 읽습니다.', 'activity', 'rare', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1200}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '여기서부터는 높이를 세는 대신 남은 봉우리를 셉니다.', 'activity', 'epic', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1600}'::jsonb, ARRAY['hiking']::text[]),
    ('높은 곳', '화이트 룸은 가장 멀리 닿았던 숨을 기억합니다.', 'activity', 'mystic', NULL, 'hiking:A1', 4, '{"activity_type":"hiking","max_elevation_m":1900}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:L1 · 산에서의 하루 — 한 번에 3시간
    ('산에서의 하루', '해가 뜨고 지는 동안 산에 있었습니다.', 'activity', 'common', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":180}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '그루터기 살롱은 하루를 통째로 숲에 두고 가는 손님을 반깁니다.', 'activity', 'rare', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":300}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '능선에서 보내는 시간이 도시에서 보내는 하루보다 길어집니다.', 'activity', 'epic', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":480}'::jsonb, ARRAY['hiking']::text[]),
    ('산에서의 하루', '화이트 룸의 문은 해가 다 지도록 내려오지 않은 사람 앞에서 열립니다.', 'activity', 'mystic', NULL, 'hiking:L1', 5, '{"activity_type":"hiking","duration_minutes":720}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:L2 · 종주 — 한 번에 12km
    ('종주', '능선을 따라 끝에서 끝까지 걸었습니다.', 'activity', 'common', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":12}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '들머리와 날머리가 서로 다른 지도에 실릴 만큼 멀어집니다.', 'activity', 'rare', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":18}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '산맥 하나가 하루의 동선 안에 들어옵니다.', 'activity', 'epic', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":25}'::jsonb, ARRAY['hiking']::text[]),
    ('종주', '능선의 끝을 묻는 사람에게 답할 수 있는 자리입니다.', 'activity', 'mystic', NULL, 'hiking:L2', 6, '{"activity_type":"hiking","single_distance_km":35}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:C1 · 산에 간 날 — 하루 1회 / 1회
    ('산에 간 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '그 하루가 여러 번 반복되면 습관이라는 이름이 붙습니다.', 'activity', 'rare', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '달력에서 산이 있던 날이 없던 날보다 또렷합니다.', 'activity', 'epic', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('산에 간 날', '이제 일정이 산을 비켜 갑니다.', 'activity', 'mystic', NULL, 'hiking:C1', 7, '{"activity_type":"hiking","active_days_count":120}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:C3 · 계절의 등반자 — 한 계절에 상승고도 4,000m
    --   [필터] season + elevation_gain_m
    ('계절의 등반자', '계절 하나를 고도로 통과했습니다.', 'activity', 'common', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":4000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '계절이 바뀌어도 벌어들이는 높이는 줄지 않습니다.', 'activity', 'rare', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":9000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '쌓아 올린 높이가 계절의 경계를 지워버립니다.', 'activity', 'epic', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":15000}'::jsonb, ARRAY['hiking']::text[]),
    ('계절의 등반자', '계절은 지나가고 쌓인 높이만 남습니다.', 'activity', 'mystic', NULL, 'hiking:C3', 8, '{"activity_type":"hiking","season":"all","elevation_gain_m":24000}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:D1 · 주말 산행 — 주말 / 1회
    --   [필터] day_of_week + total_count
    --   [근사] 「주말」을 요일별 독립 카운터로 근사
    ('주말 산행', '주말마다 도시를 벗어나는 사람이 있습니다.', 'activity', 'common', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '토요일 새벽의 들머리에서는 서로 얼굴을 알아봅니다.', 'activity', 'rare', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '주말의 행선지가 한 번도 바뀌지 않았습니다.', 'activity', 'epic', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":40}'::jsonb, ARRAY['hiking']::text[]),
    ('주말 산행', '도시가 쉬는 이틀을 능선이 통째로 가져갑니다.', 'activity', 'mystic', NULL, 'hiking:D1', 9, '{"activity_type":"hiking","day_of_week":["saturday","sunday"],"total_count":100}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N1 · 이틀 연속의 산 — 2일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('이틀 연속의 산', '하루 만에 회복하고 다시 올랐습니다.', 'activity', 'common', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '이튿날 아침의 다리는 무겁지만 방향은 이미 정해져 있습니다.', 'activity', 'rare', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '회복을 기다리지 않고 이어 붙인 날들이 층층이 쌓입니다.', 'activity', 'epic', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    ('이틀 연속의 산', '연달아 오르는 일이 예외가 아니라 기본이 되었습니다.', 'activity', 'mystic', NULL, 'hiking:N1', 10, '{"activity_type":"hiking","streak_days":2,"repeat_count":50}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N2 · 사흘의 능선 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 능선', '사흘째 다리는 거짓말을 하지 않습니다.', 'activity', 'common', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('사흘의 능선', '셋째 날의 오르막에서 몸은 요령을 배웁니다.', 'activity', 'rare', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('사흘의 능선', '연속의 끝이 어디인지 아직 확인되지 않았습니다.', 'activity', 'epic', NULL, 'hiking:N2', 11, '{"activity_type":"hiking","streak_days":3,"repeat_count":10}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:N3 · 일주일의 산 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 산', '일곱 밤을 산으로 채웠습니다.', 'activity', 'epic', NULL, 'hiking:N3', 12, '{"activity_type":"hiking","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('일주일의 산', '한 주를 통째로 능선에 두고 온 기록은 좀처럼 갱신되지 않습니다.', 'activity', 'mystic', NULL, 'hiking:N3', 12, '{"activity_type":"hiking","streak_days":7,"repeat_count":2}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:G1 · 산을 잊지 않는 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('산을 잊지 않는', '끊기지 않는 것이 높이 오르는 것보다 어렵습니다.', 'activity', 'common', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '간격이 벌어지기 전에 다시 들머리에 서는 버릇이 생겼습니다.', 'activity', 'rare', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '멀어지지 않았다는 사실이 기록으로 증명됩니다.', 'activity', 'epic', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    ('산을 잊지 않는', '산과의 거리가 한 번도 벌어진 적이 없습니다.', 'activity', 'mystic', NULL, 'hiking:G1', 13, '{"activity_type":"hiking","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:R1 · 더 높이 — 가장 높은 도달 고도 갱신
    ('더 높이', '닿아본 적 없는 높이에 처음 섰습니다.', 'activity', NULL, 1, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":1}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '지난 최고 높이는 이제 기준선이 되었습니다.', 'activity', NULL, 2, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":2}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '갱신이 반복되면 한계라는 말이 흐려집니다.', 'activity', NULL, 3, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":3}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '조금씩 위로 옮겨 놓은 선이 꽤 멀어졌습니다.', 'activity', NULL, 4, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":4}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '예전의 최고 기록이 지금의 몸풀기입니다.', 'activity', NULL, 5, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":5}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '한계는 넘는 것이 아니라 옮기는 것임을 압니다.', 'activity', NULL, 6, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":6}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '화이트 룸은 스스로를 계속 넘어서는 사람만 부릅니다.', 'activity', NULL, 7, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":7}'::jsonb, ARRAY['hiking']::text[]),
    ('더 높이', '그 위는 아직 아무도 밟지 않았습니다.', 'activity', NULL, 8, 'hiking:R1', 14, '{"activity_type":"hiking","personal_record_break":8}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:R2 · 능선 위의 시간 — 가장 긴 이동시간 갱신
    --   [근사] H-R1과 같은 사유 — personal_record_break에 지표 지정이 없다
    ('능선 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 1, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":1}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '지난번보다 오래 머문 시간이 몸에 남습니다.', 'activity', NULL, 2, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":2}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '버티는 시간을 늘리는 일은 속도를 올리는 일보다 조용합니다.', 'activity', NULL, 3, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":3}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '해가 기우는 것을 지켜보는 시간이 점점 길어집니다.', 'activity', NULL, 4, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":4}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '체력이 아니라 시간을 관리하는 단계에 들어섰습니다.', 'activity', NULL, 5, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":5}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '머무는 시간의 상한을 스스로 정합니다.', 'activity', NULL, 6, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":6}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '시간은 이제 변수가 아니라 도구입니다.', 'activity', NULL, 7, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":7}'::jsonb, ARRAY['hiking']::text[]),
    ('능선 위의 시간', '산에서 흐르는 시간을 지배합니다.', 'activity', NULL, 8, 'hiking:R2', 15, '{"activity_type":"hiking","personal_record_break":8}'::jsonb, ARRAY['hiking']::text[]),
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
    ('하산 다음 날', '다음 날을 비워 두는 것도 산행 계획의 일부입니다.', 'activity', 'rare', NULL, 'hiking:X1', 20, '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":5}'::jsonb, ARRAY['hiking']::text[]),
    ('하산 다음 날', '물러설 때를 아는 판단이 기록만큼 오래 남습니다.', 'activity', 'epic', NULL, 'hiking:X1', 20, '{"activity_type":"hiking","duration_minutes":480,"rest_after_long":1,"repeat_count":20}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:X2 · 돌아온 등반자 — 60일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 등반자', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('돌아온 등반자', '오래 비웠어도 숲은 발소리를 잊지 않습니다.', 'activity', 'rare', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":3}'::jsonb, ARRAY['hiking']::text[]),
    ('돌아온 등반자', '떠나 있던 시간이 길수록 돌아온 걸음이 또렷합니다.', 'activity', 'epic', NULL, 'hiking:X2', 21, '{"activity_type":"hiking","return_gap_days":60,"repeat_count":8}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W1 · 한여름의 등반자 — 7~8월 / 1회
    --   [필터] month + total_count
    ('한여름의 등반자', '가장 더운 두 달에도 능선에 섰습니다.', 'activity', 'common', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '폭염 경보가 뜬 날의 들머리는 유난히 한산합니다.', 'activity', 'rare', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":4}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '더위가 사람을 걸러낸 자리에 같은 이름이 남습니다.', 'activity', 'epic', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('한여름의 등반자', '가장 뜨거운 계절이 이 걸음을 멈추지 못했습니다.', 'activity', 'mystic', NULL, 'hiking:W1', 22, '{"activity_type":"hiking","month":[7,8],"total_count":30}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W2 · 한겨울의 등반자 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 등반자', '겨울 산은 장비와 판단을 함께 요구합니다.', 'activity', 'common', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '아이젠 소리에 익숙해질 무렵 겨울 능선이 편해집니다.', 'activity', 'rare', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":4}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '블랙 트랙의 겨울 구역은 판단이 서는 사람만 통과시킵니다.', 'activity', 'epic', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['hiking']::text[]),
    ('한겨울의 등반자', '한파와 눈이 이 사람의 일정에서 아무것도 지우지 못합니다.', 'activity', 'mystic', NULL, 'hiking:W2', 23, '{"activity_type":"hiking","month":[12,1,2],"total_count":30}'::jsonb, ARRAY['hiking']::text[]),
    -- hiking:W3 · 사계절의 등반자 — 네 계절 각 3회 / 1회
    ('사계절의 등반자', '같은 산의 네 얼굴을 모두 봤습니다.', 'activity', 'epic', NULL, 'hiking:W3', 24, '{"activity_type":"hiking","season_count_all":3}'::jsonb, ARRAY['hiking']::text[]),
    ('사계절의 등반자', '계절이 몇 바퀴를 돌아도 같은 능선에서 같은 사람을 봅니다.', 'activity', 'mystic', NULL, 'hiking:W3', 24, '{"activity_type":"hiking","season_count_all":6}'::jsonb, ARRAY['hiking']::text[]),
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
    ('산길을 달려온 거리', '익숙해진 흙길이 하루하루 늘어납니다.', 'activity', NULL, 2, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":60}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '그루터기 살롱의 단골로 불릴 만한 거리입니다.', 'activity', NULL, 3, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":150}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '흙과 돌 위에 쌓은 거리가 도로의 기록을 앞지릅니다.', 'activity', NULL, 4, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":320}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '지도의 등산로가 이 사람에게는 일상 구간입니다.', 'activity', NULL, 5, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":600}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '밟지 않은 산길을 찾는 편이 더 어렵습니다.', 'activity', NULL, 6, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":1100}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '흙길의 총량이 한 사람의 정체가 됩니다.', 'activity', NULL, 7, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":1900}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 달려온 거리', '산이 이 거리를 기억합니다.', 'activity', NULL, 8, 'trail_running:K1', 1, '{"activity_type":"trail_running","distance_km":3200}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:K2 · 달려서 오른 고도 — 누적 상승고도 700m
    ('달려서 오른 고도', '같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.', 'activity', NULL, 1, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":700}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '오르막을 피하지 않는 습관이 높이로 쌓입니다.', 'activity', NULL, 2, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":2200}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '누적된 높이가 이미 웬만한 봉우리를 넘어섭니다.', 'activity', NULL, 3, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":5000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '오른 높이의 합이 구름 위로 올라갑니다.', 'activity', NULL, 4, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":11000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '고도는 이제 이 사람의 기록 단위입니다.', 'activity', NULL, 5, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":20000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '높이를 세는 단위가 달라집니다.', 'activity', NULL, 6, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":36000}'::jsonb, ARRAY['trail_running']::text[]),
    ('달려서 오른 고도', '이제 높이는 목표가 아니라 배경입니다.', 'activity', NULL, 7, 'trail_running:K2', 2, '{"activity_type":"trail_running","elevation_gain_m":70000}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:K3 · 산을 달린 횟수 — 총 8회
    ('산을 달린 횟수', '몇 번 산길에 들어섰는지가 기록의 시작입니다.', 'activity', NULL, 1, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '산으로 향하는 일이 특별한 결심이 아니게 됩니다.', 'activity', NULL, 2, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '들머리에서 망설이는 시간이 사라졌습니다.', 'activity', NULL, 3, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":55}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '돌아온 횟수가 산에서의 판단력을 만듭니다.', 'activity', NULL, 4, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":100}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '어느 산이든 처음이 아닌 사람이 있습니다.', 'activity', NULL, 5, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":170}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 횟수', '산은 이 발걸음을 낯설어하지 않습니다.', 'activity', NULL, 6, 'trail_running:K3', 3, '{"activity_type":"trail_running","total_count":280}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:P1 · 산을 달리는 자 — 한 번에 15km 이상, 상승고도 400m 이상
    ('산을 달리는 자', '거리만으로도 고도만으로도 설명되지 않는 종목입니다.', 'activity', 'common', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":15,"single_elevation_m":400}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '두 가지를 동시에 채우는 사람만 이 자리에 섭니다.', 'activity', 'rare', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":25,"single_elevation_m":800}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '거리와 고도가 함께 올라가야 비로소 기록이 됩니다.', 'activity', 'epic', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":35,"single_elevation_m":1500}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달리는 자', '이 종목의 정의가 한 사람의 이름으로 좁혀집니다.', 'activity', 'mystic', NULL, 'trail_running:P1', 4, '{"activity_type":"trail_running","single_distance_km":50,"single_elevation_m":2500}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:L1 · 능선의 하루 — 한 번에 25km
    ('능선의 하루', '산에서 하루를 통째로 쓴 사람입니다.', 'activity', 'common', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '하루로 끝낼 수 있는 능선의 길이가 계속 늘어납니다.', 'activity', 'rare', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":42}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '하루 안에 넘은 능선의 수가 보통의 원정과 맞먹습니다.', 'activity', 'epic', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":60}'::jsonb, ARRAY['trail_running']::text[]),
    ('능선의 하루', '하루를 다 쓴 자리에 남는 것은 이름뿐입니다.', 'activity', 'mystic', NULL, 'trail_running:L1', 5, '{"activity_type":"trail_running","single_distance_km":100}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:L2 · 산에서의 시간 — 한 번에 4시간
    ('산에서의 시간', '해가 움직이는 동안 계속 달렸습니다.', 'activity', 'common', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":240}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '해가 기울어도 산에서 내려올 이유를 찾지 않습니다.', 'activity', 'rare', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":420}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '하루의 빛이 다 지나가도록 능선 위에 있습니다.', 'activity', 'epic', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":720}'::jsonb, ARRAY['trail_running']::text[]),
    ('산에서의 시간', '시간의 길이라는 것이 이 사람 앞에서는 의미를 잃습니다.', 'activity', 'mystic', NULL, 'trail_running:L2', 6, '{"activity_type":"trail_running","duration_minutes":1080}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:E1 · 버티컬 — 한 번에 상승고도 800m 이상
    ('버티컬', '1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.', 'activity', 'common', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":800}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '한 번의 오름으로 그 높이를 훌쩍 넘겨 둡니다.', 'activity', 'rare', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":1500}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '쉬지 않고 오르는 일이 이 사람에게는 하나의 구간일 뿐입니다.', 'activity', 'epic', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":2500}'::jsonb, ARRAY['trail_running']::text[]),
    ('버티컬', '화이트 룸의 문은 이런 오름의 끝에서 열립니다.', 'activity', 'mystic', NULL, 'trail_running:E1', 7, '{"activity_type":"trail_running","single_elevation_m":3500}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:A1 · 높은 곳을 달리다 — 한 번에 최고 도달 고도 700m 이상
    ('높은 곳을 달리다', '능선 위에서 속도를 낸 적이 있습니다.', 'activity', 'common', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":700}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '구름이 걸리는 높이에서도 발이 멈추지 않습니다.', 'activity', 'rare', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1200}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '지도에 이름만 남은 높이에 발자국이 찍혀 있습니다.', 'activity', 'epic', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1600}'::jsonb, ARRAY['trail_running']::text[]),
    ('높은 곳을 달리다', '그 높이에서는 숨소리마저 기록으로 남습니다.', 'activity', 'mystic', NULL, 'trail_running:A1', 8, '{"activity_type":"trail_running","max_elevation_m":1900}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C1 · 산을 달린 날 — 하루 1회 / 1회
    ('산을 달린 날', '하루에 한 번, 그것으로 충분합니다.', 'activity', 'common', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '그 하루가 계절을 넘겨 이어지고 있습니다.', 'activity', 'rare', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '산에 든 날의 목록이 한 사람의 이력이 됩니다.', 'activity', 'epic', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":80}'::jsonb, ARRAY['trail_running']::text[]),
    ('산을 달린 날', '그 목록 앞에서는 날씨도 계절도 변명이 되지 않습니다.', 'activity', 'mystic', NULL, 'trail_running:C1', 9, '{"activity_type":"trail_running","active_days_count":250}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C2 · 이달의 트레일 — 한 달에 120km
    ('이달의 트레일', '한 달의 총량이 산에서의 체력을 만듭니다.', 'activity', 'common', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":120}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '한 달을 넘기면 총량은 습관의 다른 이름이 됩니다.', 'activity', 'rare', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":217}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '달마다 쌓인 총량이 몸의 기본값을 바꿔 놓습니다.', 'activity', 'epic', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":350}'::jsonb, ARRAY['trail_running']::text[]),
    ('이달의 트레일', '한 달 치 기록이 남의 한 해를 앞섭니다.', 'activity', 'mystic', NULL, 'trail_running:C2', 10, '{"activity_type":"trail_running","monthly_km":550}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:C3 · 계절의 트레일러 — 한 계절에 상승고도 4,000m
    --   [필터] season + elevation_gain_m
    ('계절의 트레일러', '계절 하나를 고도로 통과했습니다.', 'activity', 'common', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":4000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '계절이 바뀌어도 오르는 높이는 줄지 않습니다.', 'activity', 'rare', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":13000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '한 계절의 누적 고도가 산맥 하나의 높이에 이릅니다.', 'activity', 'epic', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":22000}'::jsonb, ARRAY['trail_running']::text[]),
    ('계절의 트레일러', '계절은 이 사람 앞에서 높이를 감추지 못합니다.', 'activity', 'mystic', NULL, 'trail_running:C3', 11, '{"activity_type":"trail_running","season":"all","elevation_gain_m":35000}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:T1 · 새벽의 산 — 새벽 5시~아침 8시 / 1회
    --   [필터] time_range + total_count
    ('새벽의 산', '해뜨기 전 산길은 다른 세계입니다.', 'activity', 'common', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '그루터기 살롱은 해뜨기 전에 오는 손님을 알아봅니다.', 'activity', 'rare', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":15}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '능선에서 맞는 일출이 이 사람에게는 일과입니다.', 'activity', 'epic', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":50}'::jsonb, ARRAY['trail_running']::text[]),
    ('새벽의 산', '해뜨기 전의 능선은 이 사람의 발소리로 하루를 시작합니다.', 'activity', 'mystic', NULL, 'trail_running:T1', 12, '{"activity_type":"trail_running","time_range":{"start":"05:00","end":"08:00"},"total_count":120}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:T2 · 밤의 산 — 저녁 8시~새벽 5시 / 1회
    --   [필터] time_range + total_count
    ('밤의 산', '헤드램프 하나로 산길을 달려본 사람입니다.', 'activity', 'common', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('밤의 산', '어둠 속에서도 다음 발 디딜 곳이 먼저 보입니다.', 'activity', 'rare', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('밤의 산', '어두운 산길에는 이 사람의 발자국이 먼저 나 있습니다.', 'activity', 'epic', NULL, 'trail_running:T2', 13, '{"activity_type":"trail_running","time_range":{"start":"20:00","end":"05:00"},"total_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:N1 · 사흘의 산길 — 3일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('사흘의 산길', '하강 충격은 사흘째에 몰려옵니다.', 'activity', 'common', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '연달아 붙는 날들의 뻐근함을 다루는 요령이 생겼습니다.', 'activity', 'rare', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '이어 붙인 날들이 회복의 기준을 바꿔 놓습니다.', 'activity', 'epic', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    ('사흘의 산길', '연속으로 이어진 산길이 이 사람에게는 평일입니다.', 'activity', 'mystic', NULL, 'trail_running:N1', 14, '{"activity_type":"trail_running","streak_days":3,"repeat_count":50}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:N2 · 일주일의 산길 — 7일 연속 / 1회
    --   [회차] 미소비 키 streak_days
    ('일주일의 산길', '일곱 밤을 산길로 채웠습니다.', 'activity', 'common', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('일주일의 산길', '쉬는 날을 끼워 넣지 않는 사람이 있습니다.', 'activity', 'rare', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('일주일의 산길', '끊김 없는 날들이 반복되어 하나의 리듬이 됐습니다.', 'activity', 'epic', NULL, 'trail_running:N2', 15, '{"activity_type":"trail_running","streak_days":7,"repeat_count":10}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:G1 · 산길을 잊지 않는 — 2주 안에 다시 활동 / 3회
    --   [회차] 휴식 조건(interval_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 interval_days
    ('산길을 잊지 않는', '끊기지 않는 것이 멀리 가는 것보다 어렵습니다.', 'activity', 'common', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '그루터기 살롱은 잊지 않고 돌아오는 발소리를 알아봅니다.', 'activity', 'rare', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '간격이 벌어지지 않는 사람은 산에서 따로 분류됩니다.', 'activity', 'epic', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길을 잊지 않는', '산길은 이 사람이 비운 자리를 가져본 적이 없습니다.', 'activity', 'mystic', NULL, 'trail_running:G1', 16, '{"activity_type":"trail_running","interval_days":14,"repeat_count":52}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R1 · 더 멀리 — 가장 긴 거리 갱신
    ('더 멀리', '산에서의 거리는 도로의 거리와 무게가 다릅니다.', 'activity', NULL, 1, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '어제의 최장 거리가 오늘의 출발선이 됩니다.', 'activity', NULL, 2, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '한계라 여겼던 지점을 이미 지나쳐 왔습니다.', 'activity', NULL, 3, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '자신의 기록을 넘어서는 일이 습관이 됐습니다.', 'activity', NULL, 4, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '기록을 갱신할 때마다 다음 목표가 저절로 멀어집니다.', 'activity', NULL, 5, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '비교할 상대가 과거의 자신밖에 남지 않았습니다.', 'activity', NULL, 6, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '최장 거리라는 말이 잠깐만 유효합니다.', 'activity', NULL, 7, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('더 멀리', '끝을 정하지 않은 사람에게는 한계가 없습니다.', 'activity', NULL, 8, 'trail_running:R1', 17, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R2 · 산길의 정점 — 가장 높은 도달 고도 갱신
    --   [근사] T-R1·T-R3와 같은 사유
    ('산길의 정점', '닿아본 적 없는 높이를 달려서 올랐습니다.', 'activity', NULL, 1, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '한 번 닿은 높이는 곧 기준선이 됩니다.', 'activity', NULL, 2, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '올려다보던 능선이 발밑으로 내려옵니다.', 'activity', NULL, 3, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '새 높이에 닿는 일이 더는 사건이 아닙니다.', 'activity', NULL, 4, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '오를 곳을 고를 때 높이는 기준에서 빠집니다.', 'activity', NULL, 5, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '정상이라는 말이 이 사람에게는 통과점입니다.', 'activity', NULL, 6, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '더 높은 곳을 찾는 일이 어려워졌습니다.', 'activity', NULL, 7, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길의 정점', '화이트 룸에 닿았다는 소문은 이런 높이에서 시작됩니다.', 'activity', NULL, 8, 'trail_running:R2', 18, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:R3 · 산길 위의 시간 — 가장 긴 이동시간 갱신
    --   [근사] T-R1·T-R2와 같은 사유
    ('산길 위의 시간', '산에서 버틴 시간을 스스로 늘렸습니다.', 'activity', NULL, 1, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '버틸 수 있는 시간이 조금씩 길어지고 있습니다.', 'activity', NULL, 2, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":2}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '지쳐서 멈추던 지점이 점점 뒤로 물러납니다.', 'activity', NULL, 3, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '시간이 길어질수록 판단이 오히려 또렷해집니다.', 'activity', NULL, 4, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":4}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '오래 머무는 일 자체가 이 사람의 무기입니다.', 'activity', NULL, 5, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '시계를 보지 않아도 몸이 남은 시간을 압니다.', 'activity', NULL, 6, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":6}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '지구력이라는 말은 이제 설명이 아닙니다.', 'activity', NULL, 7, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":7}'::jsonb, ARRAY['trail_running']::text[]),
    ('산길 위의 시간', '산 위의 시간은 이 사람을 지치게 하지 못합니다.', 'activity', NULL, 8, 'trail_running:R3', 19, '{"activity_type":"trail_running","personal_record_break":8}'::jsonb, ARRAY['trail_running']::text[]),
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
    ('내리막의 대가', '내려온 다리를 다루는 법을 아는 것도 산에서의 실력입니다.', 'activity', 'rare', NULL, 'trail_running:X1', 24, '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":5}'::jsonb, ARRAY['trail_running']::text[]),
    ('내리막의 대가', '무너지지 않는 사람은 회복까지 계획에 넣어 둡니다.', 'activity', 'epic', NULL, 'trail_running:X1', 24, '{"activity_type":"trail_running","single_distance_km":35,"rest_after_long":1,"repeat_count":20}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:X2 · 돌아온 트레일러 — 30일 이상 쉬고 복귀 / 1회
    --   [회차] 휴식 조건(return_gap_days)은 repeat_count와 함께 쓸 수 없다
    --   [회차] 미소비 키 return_gap_days
    ('돌아온 트레일러', '돌아왔다는 사실이 떠났던 사실을 덮습니다.', 'activity', 'common', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('돌아온 트레일러', '그루터기 살롱은 오래 비운 자리도 그대로 남겨 둡니다.', 'activity', 'rare', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('돌아온 트레일러', '몇 번을 멀어져도 결국 같은 들머리에 서 있습니다.', 'activity', 'epic', NULL, 'trail_running:X2', 25, '{"activity_type":"trail_running","return_gap_days":30,"repeat_count":10}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:W1 · 한겨울의 트레일러 — 12~2월 / 1회
    --   [필터] month + total_count
    ('한겨울의 트레일러', '얼어붙은 산길을 달리는 사람은 드뭅니다.', 'activity', 'common', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('한겨울의 트레일러', '얼음과 눈이 이 사람의 계획을 바꾸지 못합니다.', 'activity', 'rare', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('한겨울의 트레일러', '블랙 트랙은 이런 날씨에만 입구를 드러냅니다.', 'activity', 'epic', NULL, 'trail_running:W1', 26, '{"activity_type":"trail_running","month":[12,1,2],"total_count":12}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:W2 · 사계절의 트레일러 — 네 계절 각 3회 / 1회
    ('사계절의 트레일러', '같은 산길의 네 얼굴을 모두 달렸습니다.', 'activity', 'epic', NULL, 'trail_running:W2', 27, '{"activity_type":"trail_running","season_count_all":3}'::jsonb, ARRAY['trail_running']::text[]),
    ('사계절의 트레일러', '계절이 몇 번 바뀌어도 같은 산길에 같은 사람이 있습니다.', 'activity', 'mystic', NULL, 'trail_running:W2', 27, '{"activity_type":"trail_running","season_count_all":6}'::jsonb, ARRAY['trail_running']::text[]),
    -- trail_running:H1 · 오르막의 심장 — 한 번에 1시간 이상, 평균 심박 155bpm 이상 / 1회
    --   [회차] 미소비 키 avg_heartrate_bpm
    ('오르막의 심장', '숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.', 'activity', 'common', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":1}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '심장이 한계에 가까워질수록 오히려 자세가 정돈됩니다.', 'activity', 'rare', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":8}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '오르막에서 흔들리지 않는 심박이 그대로 기록이 됩니다.', 'activity', 'epic', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":25}'::jsonb, ARRAY['trail_running']::text[]),
    ('오르막의 심장', '화이트 룸은 한계 너머에서 뛰는 심장을 부릅니다.', 'activity', 'mystic', NULL, 'trail_running:H1', 28, '{"activity_type":"trail_running","avg_heartrate_bpm":155,"duration_minutes":60,"repeat_count":70}'::jsonb, ARRAY['trail_running']::text[]),
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
