-- Migration 027: 012_item_badges_100.sql의 고아 아이템 배지 제거
--
-- [배경]
--   012_item_badges_100.sql에서 item_book_id / faction_id 없이 삽입된 100개 아이템 배지가
--   019_seed_worldview.sql의 세계관 시스템(item_book_id 필수)과 공존 중.
--   이 배지들은:
--     1. 드랍 풀에 포함되어 사용자에게 드랍됨 (서머 팜 빈티지 등)
--     2. 어떤 아이템북에도 슬롯을 채울 수 없어 사용 불가 (item_book_id = NULL)
--     3. 어드민에 표시되지 않음 (전체 배지 수 > Supabase 기본 row limit)
--
-- [삭제 대상]
--   badges 테이블에서 type = 'item' AND item_book_id IS NULL 인 행 전체
--
-- [삭제 순서] FK 의존성 처리
--   1. user_activity_badges (badge_id FK, no cascade)
--   2. inventory_items (badge_id FK, no cascade)
--      → poi_drops.inventory_item_id ON DELETE CASCADE → 자동 삭제
--   3. inventory.used_slots 재계산
--   4. badges 삭제

BEGIN;

-- 1. 고아 배지 획득 기록 삭제 (user_activity_badges)
DELETE FROM public.user_activity_badges
WHERE badge_id IN (
  SELECT id FROM public.badges
  WHERE type = 'item' AND item_book_id IS NULL
);

-- 2. 인벤토리 아이템 삭제 (poi_drops는 ON DELETE CASCADE로 자동 처리)
DELETE FROM public.inventory_items
WHERE badge_id IN (
  SELECT id FROM public.badges
  WHERE type = 'item' AND item_book_id IS NULL
);

-- 3. inventory.used_slots 재계산 (삭제된 아이템 반영)
UPDATE public.inventory inv
SET used_slots = (
  SELECT COUNT(*) FROM public.inventory_items WHERE inventory_id = inv.id
);

-- 4. 고아 아이템 배지 삭제
DELETE FROM public.badges
WHERE type = 'item' AND item_book_id IS NULL;

COMMIT;

-- 검증 쿼리:
-- SELECT COUNT(*) FROM public.badges WHERE type = 'item' AND item_book_id IS NULL;
-- → 0 이면 정상
