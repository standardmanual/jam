-- 335: 대표 이미지가 없는 컬렉션(item_books)에 아이템 배지 이미지를 무작위로 채운다 (2026-11-11 실행 완료)
-- 대상: item_books.image_url 이 NULL 또는 빈 문자열 (실행 당시 50건: 활성 15, 비활성 35)
-- 후보: 삭제되지 않은 아이템 배지의 서로 다른 image_url (171종)
-- 백업: item_book_img_backup_20261111 (대상 id와 이전 image_url). RLS 켜고 anon·authenticated 권한 회수.

CREATE TABLE public.item_book_img_backup_20261111 AS
  SELECT id, image_url AS old_image_url FROM public.item_books
  WHERE image_url IS NULL OR btrim(image_url)='';
ALTER TABLE public.item_book_img_backup_20261111 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_book_img_backup_20261111 FROM anon, authenticated, public;

DO $$
DECLARE pool text[]; n int;
BEGIN
  SELECT array_agg(u ORDER BY u) INTO pool FROM (
    SELECT DISTINCT image_url u FROM public.badges
    WHERE type::text='item' AND deleted_at IS NULL AND image_url IS NOT NULL AND btrim(image_url)<>''
  ) s;
  n := array_length(pool,1);
  UPDATE public.item_books b SET image_url = pool[1 + floor(random()*n)::int]
  FROM public.item_book_img_backup_20261111 k WHERE b.id=k.id;
END $$;
