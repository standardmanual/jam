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
-- 배지명·설명 문구는 한국어 리뷰(UX_WRITING_GUIDELINE.md 대조)를 거쳐 최종 확정했다.
-- "세계관"·"컬렉션입니다"·"스트릭"·"출석"·"마스터" 등 가이드라인 금지어·과사용 표현을 걷어내고,
-- 슬롯(첫 획득/2일/하루2회/5일/주5일/14일)별 종목 접미사(워커/러너/라이더)로 명명 규칙을 통일했다.
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
    '걷고, 뛰고, 달리는 가장 기본적인 움직임을 기념하는 배지예요. 어느 트라이브를 골랐든 모두 받을 수 있어요.',
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
  ('산책의 시작', '1.5km 이상 가볍게 한 번 걷기', 'common'),
  ('이틀 연속 워커', '이틀 내리 걷기', 'common'),
  ('하루 두 번 워커', '하루에 나눠서 두 번 이상 걷기', 'rare'),
  ('닷새 연속 워커', '닷새 내리 걷기', 'rare'),
  ('주 5일 워커', '한 주에 닷새 이상 걷기', 'epic'),
  ('2주 연속 워커', '2주 내리 걷기', 'mystic'),
  -- 러닝
  ('러닝의 시작', '2km 이상 가볍게 한 번 뛰기, 페이스는 몰라도 괜찮아요', 'common'),
  ('이틀 연속 러너', '이틀 내리 뛰기', 'common'),
  ('하루 두 번 러너', '하루에 나눠서 두 번 이상 뛰기', 'rare'),
  ('닷새 연속 러너', '닷새 내리 뛰기', 'rare'),
  ('주 5일 러너', '한 주에 닷새 이상 뛰기', 'epic'),
  ('2주 연속 러너', '2주 내리 뛰기', 'mystic'),
  -- 라이딩
  ('라이딩의 시작', '3km 이상 가볍게 한 번 자전거 타기', 'common'),
  ('이틀 연속 라이더', '이틀 내리 자전거 타기', 'common'),
  ('하루 두 번 라이더', '하루에 나눠서 두 번 이상 자전거 타기', 'rare'),
  ('닷새 연속 라이더', '닷새 내리 자전거 타기', 'rare'),
  ('주 5일 라이더', '한 주에 닷새 이상 자전거 타기', 'epic'),
  ('2주 연속 라이더', '2주 내리 자전거 타기', 'mystic')
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
