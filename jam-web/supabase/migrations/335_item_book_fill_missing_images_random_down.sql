-- 335 되돌림: 채워 넣은 컬렉션 대표 이미지를 백업 표의 이전 값으로 되돌린다
UPDATE public.item_books b SET image_url = k.old_image_url
FROM public.item_book_img_backup_20261111 k WHERE b.id = k.id;
-- 되돌린 뒤 백업 표 삭제는 확인이 끝나고 따로 한다:
-- DROP TABLE public.item_book_img_backup_20261111;
