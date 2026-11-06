-- 328_issued_item_books_down.sql
-- 328을 되돌린다 (티켓 20261106_1227)
--
-- 하는 일 (한 트랜잭션)
--   1. 정책 `item_books: 전체 읽기 허용`을 215의 조건으로 복원한다. 발급 기록 표를 보는 정책을 먼저 바꿔야 표를 지울 수 있다.
--   2. 정책 `badges: 전체 읽기 허용`을 327의 조건(배지 단위 issued_item_badges)으로 복원한다.
--   3. 트리거 `trg_badges_mark_book_issued_on_move`, `trg_inventory_items_mark_book_issued`를 지운다.
--   4. 트리거 함수 두 개를 지운다.
--   5. 표 `issued_item_books`를 지운다(정책 포함).
--   1단계의 `issued_item_badges` 표와 트리거는 건드리지 않는다.

BEGIN;

DROP POLICY IF EXISTS "item_books: 전체 읽기 허용" ON public.item_books;

CREATE POLICY "item_books: 전체 읽기 허용" ON public.item_books
  FOR SELECT TO authenticated
  USING (is_active = TRUE AND (valid_from IS NULL OR valid_from <= now()));

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
      OR EXISTS (
        SELECT 1 FROM public.issued_item_badges s
        WHERE s.badge_id = badges.id
      )
    )
  );

DROP TRIGGER IF EXISTS trg_badges_mark_book_issued_on_move ON public.badges;
DROP TRIGGER IF EXISTS trg_inventory_items_mark_book_issued ON public.inventory_items;

DROP FUNCTION IF EXISTS public.trg_badges_mark_book_issued_on_move();
DROP FUNCTION IF EXISTS public.trg_inventory_items_mark_book_issued();

DROP TABLE IF EXISTS public.issued_item_books;

COMMIT;
