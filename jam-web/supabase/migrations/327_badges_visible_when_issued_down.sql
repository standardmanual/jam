-- 327_badges_visible_when_issued_down.sql
-- 327을 되돌린다 (티켓 20261106_1124)
--
-- 하는 일 (한 트랜잭션)
--   1. 정책 `badges: 전체 읽기 허용`을 216의 조건으로 복원한다. 함수를 부르는 정책을 먼저 바꿔야 함수를 지울 수 있다.
--   2. 함수 `badge_has_live_item(uuid)`를 지운다.
--   3. 부분 인덱스 둘을 지운다.

BEGIN;

DROP POLICY IF EXISTS "badges: 전체 읽기 허용" ON public.badges;

CREATE POLICY "badges: 전체 읽기 허용" ON public.badges
  FOR SELECT TO authenticated
  USING (
    (type <> 'activity' OR valid_from IS NULL OR valid_from <= now())
    AND (
      item_book_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.item_books b
        WHERE b.id = badges.item_book_id
          AND b.is_active = TRUE
          AND (b.valid_from IS NULL OR b.valid_from <= now())
      )
    )
  );

DROP FUNCTION IF EXISTS public.badge_has_live_item(uuid);

DROP INDEX IF EXISTS public.idx_inventory_items_badge_live;
DROP INDEX IF EXISTS public.idx_poi_drops_badge_available;

COMMIT;
