-- 119: 액티비티 배지 21건 등급별 조건값을 ACTIVITY_BADGES.md(레시피 v4) 기준으로 동기화
-- 티켓 20260831_2100
--
-- 배경: 나머지 32개 배지군(속도·페이스·지속시간·빈도 속성) 전수 대조 결과, Rare 이상
-- 등급 조건값 21곳이 DB(033_reseed_activity_badges_v3.sql, 2026-07-20)와 문서
-- (ACTIVITY_BADGES.md, 제목이 이미 "레시피 v4")가 다르다. Common은 전원 일치. 이후 이
-- 배지들을 건드린 마이그레이션이 없어, 문서가 나중에 밸런스 조정을 거쳤는데 그걸 반영하는
-- 마이그레이션이 한 번도 안 나간 것으로 판단된다(판단 근거: 문서 값이 상위 등급으로 갈수록
-- 증분이 커지는 형태로 `/gamification` "후반부일수록 의미있는 도약" 원칙에 부합 — 우연한
-- 오타 21건보다 의도된 리밸런싱 쪽이 개연성 있음).
--
-- ⚠️ 이 판단에 100% 확신은 없다. 실행 전 사용자에게 아래 표를 다시 보여주고 최종 확인을
-- 받은 뒤 실행할 것 (이 표는 문서 근거는 있지만 "왜 바뀌었는지" 적힌 별도 티켓이 없다).
--
-- prerequisite_badge_names는 32개군 전부 문서와 일치 — 이 마이그레이션에서 손대지 않는다.
--
-- ────────────────────────────────────────────────────────────────────────
-- 배지                  | 등급     | 필드              | 현재 DB → 목표(문서)
-- ────────────────────────────────────────────────────────────────────────
-- 지구력의 전사(러닝)     | Common  | duration_minutes | 30분  → 20분
-- 지구력의 전사(러닝)     | Rare    | duration_minutes | 60분  → 45분
-- 지구력의 전사(러닝)     | Epic    | duration_minutes | 90분  → 75분
-- 산책의 명상가(걷기)     | Epic    | duration_minutes | 90분  → 100분
-- 산책의 명상가(걷기)     | Mystic  | duration_minutes | 120분 → 150분
-- 루틴의 수호자(걷기)     | Rare    | weekly_count      | 주4회 → 주5회
-- 루틴의 수호자(걷기)     | Epic    | weekly_count      | 주5회 → 주6회
-- 밤의 보행자(걷기)       | Epic    | duration_minutes | 60분  → 75분
-- 밤의 보행자(걷기)       | Mystic  | duration_minutes | 90분  → 110분
-- 달리기의 루틴(러닝)     | Epic    | weekly_count      | 주4회 → 주5회
-- 달리기의 루틴(러닝)     | Mystic  | weekly_count      | 주5회 → 주6회
-- 페달의 리듬(사이클)     | Epic    | min_speed_kmh     | 25    → 28 km/h
-- 페달의 리듬(사이클)     | Mystic  | min_speed_kmh     | 30    → 35 km/h
-- 장거리 항속(사이클)     | Mystic  | duration_minutes | 240분 → 300분
-- 사이클 루틴(사이클)     | Epic    | weekly_count      | 주4회 → 주5회
-- 사이클 루틴(사이클)     | Mystic  | weekly_count      | 주5회 → 주6회
-- 주말 등산가(등산)       | Epic    | weekly_count      | 주3회 → 주4회
-- 주말 등산가(등산)       | Mystic  | weekly_count      | 주4회 → 주5회
-- 산행의 깊이(등산)       | Epic    | duration_minutes | 180분 → 200분
-- 산행의 깊이(등산)       | Mystic  | duration_minutes | 240분 → 300분
-- 트레일 루틴(트레일)     | Mystic  | weekly_count      | 주4회 → 주5회
-- ────────────────────────────────────────────────────────────────────────
--
-- jsonb_set의 create_missing을 false로 둬 대상 키가 실제로 존재할 때만 값을 바꾼다
-- (이름·등급 매칭이 어긋나도 새 키를 조용히 만들어내지 않도록 방어).

BEGIN;

-- ── 지구력의 전사 (러닝, duration_minutes) ───────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '20'::jsonb, false)
 WHERE type = 'activity' AND name = '지구력의 전사' AND rarity = 'common' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '45'::jsonb, false)
 WHERE type = 'activity' AND name = '지구력의 전사' AND rarity = 'rare' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '75'::jsonb, false)
 WHERE type = 'activity' AND name = '지구력의 전사' AND rarity = 'epic' AND condition_json->>'activity_type' = 'running';

-- ── 산책의 명상가 (걷기, duration_minutes) ────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '100'::jsonb, false)
 WHERE type = 'activity' AND name = '산책의 명상가' AND rarity = 'epic' AND condition_json->>'activity_type' = 'walking';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '150'::jsonb, false)
 WHERE type = 'activity' AND name = '산책의 명상가' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'walking';

-- ── 루틴의 수호자 (걷기, weekly_count) ────────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '5'::jsonb, false)
 WHERE type = 'activity' AND name = '루틴의 수호자' AND rarity = 'rare' AND condition_json->>'activity_type' = 'walking';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '6'::jsonb, false)
 WHERE type = 'activity' AND name = '루틴의 수호자' AND rarity = 'epic' AND condition_json->>'activity_type' = 'walking';

-- ── 밤의 보행자 (걷기, duration_minutes) ──────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '75'::jsonb, false)
 WHERE type = 'activity' AND name = '밤의 보행자' AND rarity = 'epic' AND condition_json->>'activity_type' = 'walking';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '110'::jsonb, false)
 WHERE type = 'activity' AND name = '밤의 보행자' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'walking';

-- ── 달리기의 루틴 (러닝, weekly_count) ────────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '5'::jsonb, false)
 WHERE type = 'activity' AND name = '달리기의 루틴' AND rarity = 'epic' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '6'::jsonb, false)
 WHERE type = 'activity' AND name = '달리기의 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'running';

-- ── 페달의 리듬 (사이클, min_speed_kmh) ───────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{min_speed_kmh}', '28'::jsonb, false)
 WHERE type = 'activity' AND name = '페달의 리듬' AND rarity = 'epic' AND condition_json->>'activity_type' = 'cycling';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{min_speed_kmh}', '35'::jsonb, false)
 WHERE type = 'activity' AND name = '페달의 리듬' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'cycling';

-- ── 장거리 항속 (사이클, duration_minutes) ────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '300'::jsonb, false)
 WHERE type = 'activity' AND name = '장거리 항속' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'cycling';

-- ── 사이클 루틴 (사이클, weekly_count) ────────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '5'::jsonb, false)
 WHERE type = 'activity' AND name = '사이클 루틴' AND rarity = 'epic' AND condition_json->>'activity_type' = 'cycling';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '6'::jsonb, false)
 WHERE type = 'activity' AND name = '사이클 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'cycling';

-- ── 주말 등산가 (등산, weekly_count) ──────────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '4'::jsonb, false)
 WHERE type = 'activity' AND name = '주말 등산가' AND rarity = 'epic' AND condition_json->>'activity_type' = 'hiking';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '5'::jsonb, false)
 WHERE type = 'activity' AND name = '주말 등산가' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'hiking';

-- ── 산행의 깊이 (등산, duration_minutes) ──────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '200'::jsonb, false)
 WHERE type = 'activity' AND name = '산행의 깊이' AND rarity = 'epic' AND condition_json->>'activity_type' = 'hiking';
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{duration_minutes}', '300'::jsonb, false)
 WHERE type = 'activity' AND name = '산행의 깊이' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'hiking';

-- ── 트레일 루틴 (트레일러닝, weekly_count) ────────────────────────────────
UPDATE public.badges SET condition_json = jsonb_set(condition_json, '{weekly_count}', '5'::jsonb, false)
 WHERE type = 'activity' AND name = '트레일 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'trail_running';

COMMIT;

-- ── 확인용 (실행하지 않음, 참고) ──────────────────────────────────────────
-- SELECT name, rarity, condition_json FROM public.badges
--  WHERE type='activity' AND name IN (
--    '지구력의 전사','산책의 명상가','루틴의 수호자','밤의 보행자','달리기의 루틴',
--    '페달의 리듬','장거리 항속','사이클 루틴','주말 등산가','산행의 깊이','트레일 루틴'
--  ) ORDER BY name, rarity;
-- 위 21행이 이 파일 상단 표의 "목표(문서)" 값과 정확히 일치하는지 대조할 것.
