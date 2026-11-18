-- 346 되돌림: 컬렉션 대표 이미지를 백업 표의 옛 값으로 되돌린다(티켓 20261118_1707).
-- 백업 표가 있어야 한다. 되돌린 뒤 백업 표는 확인하고 지운다.
BEGIN;

UPDATE public.item_books b
   SET image_url = k.old_image_url
  FROM public.item_books_cover_backup_20261118 k
 WHERE k.id = b.id;

COMMIT;
