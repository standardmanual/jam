-- ============================================================
-- [3/3] 등급명 변경에 따른 과거 데이터·컨텐츠 문구 정정 — 티켓 20260831_1115
--
-- 실행 순서
--   1) seed_rarity_rename_backup_20260831.sql          (백업)
--   2) migrations/115_rename_rarity_epic_mystic.sql    (enum·컬럼 rename)
--   3) 이 파일                                          (JSONB 과거값 + 컨텐츠 문구)
--
-- enum RENAME VALUE는 badge_rarity 컬럼만 따라 바뀐다. JSONB에 문자열로 박혀 있는
-- 과거 등급값과, 사람이 쓴 한글/영문 등급 표기는 별도로 고쳐야 한다.
--
-- ── 매핑 (직관에 반하므로 주의) ───────────────────────────────────────
--   legendary / legend / 레전더리 / 레전드   →  epic  / Epic     (3단계)
--   mythic    / 신화                          →  mystic / Mystic  (4단계)
--   * 'mystic'과 'mythic'은 한 글자 차이다. 치환 후 반드시 검증 쿼리로 확인한다.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. user_activity_feed.metadata->>'rarity'  (실측: legendary/legend 46건, mythic 41건)
--    badge_earned / item_dropped / item_picked_up 이벤트의 최상위 키다.
--    'legendary'와 'legend'는 **둘 다 구 3단계**를 뜻하므로 함께 epic으로 보낸다.
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.user_activity_feed
SET metadata = jsonb_set(metadata, '{rarity}', '"epic"'::jsonb)
WHERE metadata->>'rarity' IN ('legendary', 'legend');

UPDATE public.user_activity_feed
SET metadata = jsonb_set(metadata, '{rarity}', '"mystic"'::jsonb)
WHERE metadata->>'rarity' = 'mythic';

-- ────────────────────────────────────────────────────────────────────────
-- 2. engine_decision_log.payload  (실측: 144건)
--    등급이 rarity / rolledRarity / cappedRarity 등 여러 키에 흩어져 있고, 앰비언트
--    드랍 로그는 등급 자체를 **키**로 쓰는 분포 객체({common,rare,legend,mythic})도 담는다.
--    따라서 키 단위 jsonb_set이 아니라 "따옴표로 감싼 정확한 토큰" 치환으로 처리한다.
--    `"legend"` 처럼 앞뒤 따옴표를 포함해 매칭하므로 `"legendary_xxx"` 같은 부분 문자열이나
--    한글 문구는 걸리지 않는다.
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.engine_decision_log
SET payload = replace(
                replace(
                  replace(payload::text, '"legendary"', '"epic"'),
                '"legend"', '"epic"'),
              '"mythic"', '"mystic"')::jsonb
WHERE payload::text LIKE '%"legendary"%'
   OR payload::text LIKE '%"legend"%'
   OR payload::text LIKE '%"mythic"%';

-- ────────────────────────────────────────────────────────────────────────
-- 3. missions — 한글 등급 표기를 영문 고정 용어로 통일 (실측 3건)
--    "'굿 바이브스 온리' 레전더리 배지 획득하기" → "… Epic 배지 획득하기"
--    "희귀도 legendary 아이템배지 …"             → "희귀도 Epic 아이템배지 …"
--    "'아이 오브 더 선' 신화 배지 획득하기"       → "… Mystic 배지 획득하기"
--    "'러브 세이브' 신화 배지 획득하기"           → "… Mystic 배지 획득하기"
--    "신화"는 세계관 카피에서 다른 뜻으로 쓰일 수 있으므로 "신화 배지"로만 좁힌다.
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.missions
SET title = replace(
              replace(
                replace(
                  replace(title, '레전더리 배지', 'Epic 배지'),
                '레전드 배지', 'Epic 배지'),
              '신화 배지', 'Mystic 배지'),
            '희귀도 legendary', '희귀도 Epic')
WHERE title LIKE '%레전더리 배지%'
   OR title LIKE '%레전드 배지%'
   OR title LIKE '%신화 배지%'
   OR title LIKE '%희귀도 legendary%';

UPDATE public.missions
SET description = replace(
                    replace(
                      replace(
                        replace(description, '레전더리 배지', 'Epic 배지'),
                      '레전드 배지', 'Epic 배지'),
                    '신화 배지', 'Mystic 배지'),
                  '희귀도 legendary', '희귀도 Epic')
WHERE description LIKE '%레전더리 배지%'
   OR description LIKE '%레전드 배지%'
   OR description LIKE '%신화 배지%'
   OR description LIKE '%희귀도 legendary%';

-- ────────────────────────────────────────────────────────────────────────
-- 4. today_cards — 한글 등급 표기 통일 (실측 2건)
--    "핫한 성수동에서 발견된 레전드 배지" / "보유자가 손에 꼽는 신화 배지"
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.today_cards
SET title    = replace(replace(replace(title,    '레전더리 배지', 'Epic 배지'), '레전드 배지', 'Epic 배지'), '신화 배지', 'Mystic 배지'),
    subtitle = replace(replace(replace(subtitle, '레전더리 배지', 'Epic 배지'), '레전드 배지', 'Epic 배지'), '신화 배지', 'Mystic 배지')
WHERE title    LIKE '%레전더리 배지%' OR title    LIKE '%레전드 배지%' OR title    LIKE '%신화 배지%'
   OR subtitle LIKE '%레전더리 배지%' OR subtitle LIKE '%레전드 배지%' OR subtitle LIKE '%신화 배지%';

UPDATE public.today_cards
SET body_markdown = replace(replace(replace(body_markdown, '레전더리 배지', 'Epic 배지'), '레전드 배지', 'Epic 배지'), '신화 배지', 'Mystic 배지')
WHERE body_markdown LIKE '%레전더리 배지%'
   OR body_markdown LIKE '%레전드 배지%'
   OR body_markdown LIKE '%신화 배지%';

-- ────────────────────────────────────────────────────────────────────────
-- 5. badges.description — 다음 등급 안내 문구의 영문 등급명 (실측 10건)
--    "이제 첫 숨결 Legend에 도전하세요" → "… Epic에 도전하세요"
--    "첫 고도 Mythic에 도전하세요"      → "… Mystic에 도전하세요"
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.badges
SET description = replace(replace(replace(description, 'Legendary', 'Epic'), 'Legend', 'Epic'), 'Mythic', 'Mystic')
WHERE description LIKE '%Legend%'
   OR description LIKE '%Mythic%';

-- 한글 등급 표기가 badges.description에도 있을 경우 (세계관 카피의 "전설"은 건드리지 않는다 —
-- 등급명이 더 이상 Legend가 아니므로 충돌하지 않는다. "… 배지"로 좁힌 표기만 정정한다)
UPDATE public.badges
SET description = replace(replace(replace(description, '레전더리 배지', 'Epic 배지'), '레전드 배지', 'Epic 배지'), '신화 배지', 'Mystic 배지')
WHERE description LIKE '%레전더리 배지%'
   OR description LIKE '%레전드 배지%'
   OR description LIKE '%신화 배지%';

COMMIT;

-- ============================================================
-- 검증 쿼리 — 아래 4개 모두 0건이어야 한다
-- ============================================================
-- (1) 피드 JSONB 잔재
-- SELECT metadata->>'rarity' AS r, count(*) FROM public.user_activity_feed
--  WHERE metadata->>'rarity' IN ('legendary','legend','mythic') GROUP BY 1;
--
-- (2) 엔진 로그 JSONB 잔재
-- SELECT count(*) FROM public.engine_decision_log
--  WHERE payload::text LIKE '%"legendary"%' OR payload::text LIKE '%"legend"%'
--     OR payload::text LIKE '%"mythic"%';
--
-- (3) 컨텐츠 문구 잔재 — 'mythic' 오탈자 포함
-- SELECT 'missions' AS t, id::text, title FROM public.missions
--  WHERE title ILIKE '%legend%' OR title ILIKE '%mythic%' OR title LIKE '%레전%' OR title LIKE '%신화 배지%'
-- UNION ALL
-- SELECT 'today_cards', id::text, title FROM public.today_cards
--  WHERE title ILIKE '%legend%' OR title ILIKE '%mythic%' OR title LIKE '%레전%' OR title LIKE '%신화 배지%'
-- UNION ALL
-- SELECT 'badges', id::text, name FROM public.badges
--  WHERE description ILIKE '%legend%' OR description ILIKE '%mythic%'
--     OR description LIKE '%레전%' OR description LIKE '%신화 배지%';
--
-- (4) mythic/mystic 철자 확인 — mystic만 남아야 한다
-- SELECT rarity, count(*) FROM public.badges GROUP BY rarity ORDER BY rarity;
