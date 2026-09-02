-- 127: 액티비티 배지 description 문구의 수치를 condition_json 실제값에 맞춰 교정 (14건)
-- 티켓 20260902_1722
--
-- 배경: Supabase(jam-prod) badges 테이블 전수 대조 결과, `description`(화면 노출 문구)에
-- 적힌 숫자와 `condition_json`(실제 발급 조건값)이 서로 다른 배지 14건을 발견했다.
-- condition_json은 배지엔진이 실제 판정에 쓰는 값이라 정상 동작하지만, 노출 문구가 다른
-- 숫자를 말하고 있어 오정보다.
--
-- 원인: 마이그레이션 119(`119_sync_activity_badge_conditions_to_v4.sql`, 티켓 20260831_2100)가
-- condition_json을 ACTIVITY_BADGES.md(레시피 v4) 목표값으로 동기화하면서 `description` 텍스트는
-- 갱신하지 않아, 그 안에 있던 옛 숫자가 그대로 잔류했다. 러닝 `첫 숨결` Epic/Mystic 2건은 더
-- 앞선 티켓 20260813_001(조건값 하향 조정) 때부터 잔류해온 별도 이력이다(20260825_028에서
-- condition_json만 40/100으로 맞추고 description은 그대로 둠).
--
-- condition_json 자체는 변경하지 않는다 — description 텍스트만 숫자를 교정한다.
-- 같은 배지 그룹의 다른 등급 설명 문체를 그대로 유지하고 숫자만 바꾼다.
--
-- ────────────────────────────────────────────────────────────────────────
-- 종목            | 배지명         | 등급    | 필드              | 실제조건값 | 문구속값(오류)
-- ────────────────────────────────────────────────────────────────────────
-- cycling         | 사이클 루틴     | epic    | weekly_count      | 5    | 4
-- cycling         | 사이클 루틴     | mystic  | weekly_count      | 6    | 5
-- hiking          | 주말 등산가     | epic    | weekly_count      | 4    | 3
-- hiking          | 주말 등산가     | mystic  | weekly_count      | 5    | 4
-- running         | 달리기의 루틴   | epic    | weekly_count      | 5    | 4
-- running         | 달리기의 루틴   | mystic  | weekly_count      | 6    | 5
-- running         | 지구력의 전사   | common  | duration_minutes  | 20   | 30
-- running         | 지구력의 전사   | epic    | duration_minutes  | 75   | 90
-- running         | 첫 숨결        | epic    | distance_km       | 40   | 60
-- running         | 첫 숨결        | mystic  | distance_km       | 100  | 150
-- trail_running   | 트레일 루틴     | mystic  | weekly_count      | 5    | 4
-- walking         | 루틴의 수호자   | rare    | weekly_count      | 5    | 4
-- walking         | 루틴의 수호자   | epic    | weekly_count      | 6    | 5
-- walking         | 산책의 명상가   | epic    | duration_minutes  | 100  | 90
-- ────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── cycling: 사이클 루틴 ──────────────────────────────────────────────────
UPDATE public.badges SET description = '주 5회. 블랙 트랙이 당신의 사이클 루틴을 전설로 새깁니다.'
 WHERE type = 'activity' AND name = '사이클 루틴' AND rarity = 'epic' AND condition_json->>'activity_type' = 'cycling';
UPDATE public.badges SET description = '주 6회 라이딩. 화이트 룸은 쉬지 않는 페달을 기다립니다.'
 WHERE type = 'activity' AND name = '사이클 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'cycling';

-- ── hiking: 주말 등산가 ───────────────────────────────────────────────────
UPDATE public.badges SET description = '주 4회. 블랙 트랙의 등산가 명단에 이름이 올라갑니다.'
 WHERE type = 'activity' AND name = '주말 등산가' AND rarity = 'epic' AND condition_json->>'activity_type' = 'hiking';
UPDATE public.badges SET description = '주 5회 등산. 화이트 룸은 산을 사랑하는 자에게 열립니다.'
 WHERE type = 'activity' AND name = '주말 등산가' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'hiking';

-- ── running: 달리기의 루틴 ────────────────────────────────────────────────
UPDATE public.badges SET description = '주 5회. 블랙 트랙이 당신의 루틴을 전설급으로 기록합니다.'
 WHERE type = 'activity' AND name = '달리기의 루틴' AND rarity = 'epic' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET description = '주 6회 달리기. 화이트 룸은 달리는 자에게 문을 엽니다.'
 WHERE type = 'activity' AND name = '달리기의 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'running';

-- ── running: 지구력의 전사 ────────────────────────────────────────────────
UPDATE public.badges SET description = '20분 달리기. 섬데이 결계에 첫 지구력의 증거가 새겨집니다.'
 WHERE type = 'activity' AND name = '지구력의 전사' AND rarity = 'common' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET description = '75분 레이스. 블랙 트랙의 전사 명단에 이름이 오릅니다.'
 WHERE type = 'activity' AND name = '지구력의 전사' AND rarity = 'epic' AND condition_json->>'activity_type' = 'running';

-- ── running: 첫 숨결 ──────────────────────────────────────────────────────
UPDATE public.badges SET description = '40km. 블랙 트랙의 전설들이 당신의 폐활량을 인정합니다.'
 WHERE type = 'activity' AND name = '첫 숨결' AND rarity = 'epic' AND condition_json->>'activity_type' = 'running';
UPDATE public.badges SET description = '100km. 화이트 룸 진입 코드 확인 완료.'
 WHERE type = 'activity' AND name = '첫 숨결' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'running';

-- ── trail_running: 트레일 루틴 ────────────────────────────────────────────
UPDATE public.badges SET description = '주 5회 트레일. 화이트 룸은 야생을 사랑하는 자에게 열립니다.'
 WHERE type = 'activity' AND name = '트레일 루틴' AND rarity = 'mystic' AND condition_json->>'activity_type' = 'trail_running';

-- ── walking: 루틴의 수호자 ────────────────────────────────────────────────
UPDATE public.badges SET description = '주 5회 달성. 그루터기 살롱이 당신의 신발 소리를 기다립니다.'
 WHERE type = 'activity' AND name = '루틴의 수호자' AND rarity = 'rare' AND condition_json->>'activity_type' = 'walking';
UPDATE public.badges SET description = '주 6회. 블랙 트랙이 당신의 루틴을 전설로 새깁니다.'
 WHERE type = 'activity' AND name = '루틴의 수호자' AND rarity = 'epic' AND condition_json->>'activity_type' = 'walking';

-- ── walking: 산책의 명상가 ────────────────────────────────────────────────
UPDATE public.badges SET description = '100분 산책. 블랙 트랙의 명상가로 기록됩니다.'
 WHERE type = 'activity' AND name = '산책의 명상가' AND rarity = 'epic' AND condition_json->>'activity_type' = 'walking';

COMMIT;

-- ── 확인용 (실행하지 않음, 참고) ──────────────────────────────────────────
-- SELECT name, rarity, condition_json->>'activity_type' AS activity_type,
--        condition_json, description
--   FROM public.badges
--  WHERE type = 'activity'
--    AND name IN ('사이클 루틴','주말 등산가','달리기의 루틴','지구력의 전사','첫 숨결','트레일 루틴','루틴의 수호자','산책의 명상가')
--  ORDER BY name, rarity;
-- 위 14행에서 description에 적힌 숫자와 condition_json의 실제값이 전부 일치하는지 대조할 것.
