-- 327_badges_visible_when_issued_down.sql
-- 327을 되돌린다 (티켓 20261106_1124)
--
-- 하는 일 (한 트랜잭션)
--   1. 정책 `badges: 전체 읽기 허용`을 216의 조건으로 복원한다. 발급 기록 표를 보는 정책을 먼저 바꿔야 표를 지울 수 있다.
--   2. 트리거 `trg_inventory_items_mark_issued`를 지운다.
--   3. 트리거 함수 `trg_inventory_items_mark_issued()`를 지운다.
--   4. 표 `issued_item_badges`를 지운다(정책 포함).

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

DROP TRIGGER IF EXISTS trg_inventory_items_mark_issued ON public.inventory_items;

DROP FUNCTION IF EXISTS public.trg_inventory_items_mark_issued();

DROP TABLE IF EXISTS public.issued_item_badges;

COMMIT;
