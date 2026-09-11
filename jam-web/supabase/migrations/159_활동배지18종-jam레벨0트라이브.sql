-- 티켓 20260911_2119: 걷기·러닝·라이딩 활동배지 18종 신규 생성 (JAM! 레벨 0 트라이브)
--
-- 배경: 특정 기존 트라이브에 속하지 않는 독립 배지 묶음 18종(걷기·러닝·라이딩 각 6종)을
-- 신규 트라이브 "JAM! 레벨 0"에 등록한다. `type='item'` 배지는 활성 컬렉션(item_books,
-- is_active=true)에 소속돼야만 드랍엔진(`jam-web/src/lib/drop-engine/index.ts:172-201`)의
-- 후보 풀에 오른다는 것이 확인되어, 신규 컬렉션 "JAM! 레벨 0"도 함께 생성해 18종을
-- 그 컬렉션에 소속시킨다(과거 컬렉션 미소속 아이템배지 100개가 영구 미발급으로 전량 삭제된
-- 이력: `027_remove_legacy_item_badges.sql`).
--
-- 표의 "설명" 컬럼은 발급 조건이 아니라 배지에 표시되는 플레이버 텍스트다.
-- `condition_json`은 NULL로 둔다(조건 없는 랜덤 드랍) — `isDroppableForActivity()`는
-- condition_json이 비어 있으면 무조건 true를 반환한다(`drop-engine/index.ts:82`).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(작업 유형 content/db)에 따라 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- tribes → item_books → badges 세 단계를 CTE로 연결해 하나의 트랜잭션에서 처리한다.

BEGIN;

WITH new_tribe AS (
  INSERT INTO public.tribes (id, name, sort_order, drop_weight, is_active)
  VALUES (gen_random_uuid(), 'JAM! 레벨 0', 11, 1.0, true)
  RETURNING id
),
new_book AS (
  INSERT INTO public.item_books (id, name, description, tribe_id, is_active)
  SELECT
    gen_random_uuid(),
    'JAM! 레벨 0',
    '특정 트라이브 세계관에 속하지 않는 걷기·러닝·라이딩 기본 활동을 기념하는 배지 컬렉션입니다.',
    new_tribe.id,
    true
  FROM new_tribe
  RETURNING id, tribe_id
)
INSERT INTO public.badges (name, description, type, rarity, tribe_id, item_book_id)
SELECT v.name, v.description, 'item', v.rarity::badge_rarity, new_book.tribe_id, new_book.id
FROM new_book,
(VALUES
  -- 걷기
  ('산책의 시작', '1.5km 이상 가볍게 1회 걷기', 'common'),
  ('작은 습관', '2일 연속 걷기 기록 달성', 'common'),
  ('모닝 & 이브닝', '하루 2회 이상 나누어 걷기', 'rare'),
  ('5일 연속 출석 워킹', '5일 연속 걷기 기록 달성', 'rare'),
  ('주간 꾸준함 마스터', '주 5일 이상 걷기 기록 달성', 'epic'),
  ('14일 연속 퍼펙트 워커', '14일 연속 걷기 스트릭 달성', 'mystic'),
  -- 러닝
  ('첫걸음 러닝', '2km 이상 가볍게 1회 러닝 (페이스 무관)', 'common'),
  ('2일 연속 출석 런', '2일 연속 러닝 기록 달성', 'common'),
  ('더블 데일리 런', '하루 2회 이상 나누어 러닝 달성', 'rare'),
  ('5일 연속 습관 런', '5일 연속 러닝 기록 달성', 'rare'),
  ('주간 5일 꾸준 러너', '주 5일 이상 러닝 기록 달성', 'epic'),
  ('14일 연속 스트릭 마스터', '14일 연속 러닝 스트릭 달성', 'mystic'),
  -- 라이딩
  ('라이딩의 시작', '3km 이상 가볍게 1회 자전거 타기', 'common'),
  ('2일 연속 출석 라이딩', '2일 연속 자전거 기록 달성', 'common'),
  ('더블 데일리 라이딩', '하루 2회 이상 나누어 자전거 타기', 'rare'),
  ('5일 연속 습관 라이딩', '5일 연속 자전거 기록 달성', 'rare'),
  ('주간 5일 꾸준 라이더', '주 5일 이상 자전거 기록 달성', 'epic'),
  ('14일 연속 페달링 마스터', '14일 연속 자전거 스트릭 달성', 'mystic')
) AS v(name, description, rarity);

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 트라이브 1건 생성 확인
-- SELECT id, name, sort_order, drop_weight, is_active FROM public.tribes WHERE name = 'JAM! 레벨 0';
--
-- -- ② 컬렉션 1건 생성 확인 (is_active=true, tribe_id 연결)
-- SELECT id, name, tribe_id, is_active, required_activity_badge_id, reward_points
--   FROM public.item_books WHERE name = 'JAM! 레벨 0';
--
-- -- ③ 배지 18건 생성 확인 (type='item', condition_json IS NULL, level IS NULL, image_url IS NULL)
-- SELECT name, rarity, level, condition_json, image_url, item_book_id, tribe_id
--   FROM public.badges b
--   JOIN public.item_books ib ON ib.id = b.item_book_id
--  WHERE ib.name = 'JAM! 레벨 0'
--  ORDER BY rarity, name;  -- 18행이어야 함
--
-- -- ④ 드랍 후보 풀 포함 여부 (활성 컬렉션 소속 + type='item' + deleted_at IS NULL)
-- SELECT count(*) FROM public.badges b
--   JOIN public.item_books ib ON ib.id = b.item_book_id AND ib.is_active = true
--  WHERE ib.name = 'JAM! 레벨 0' AND b.type = 'item' AND b.deleted_at IS NULL;  -- 18

-- ↩️ 롤백 DDL (신중히 사용 — 이미 드랍된 배지가 있다면 유저 인벤토리에 영향)
--    DELETE FROM public.badges WHERE item_book_id IN (SELECT id FROM public.item_books WHERE name = 'JAM! 레벨 0');
--    DELETE FROM public.item_books WHERE name = 'JAM! 레벨 0';
--    DELETE FROM public.tribes WHERE name = 'JAM! 레벨 0';
