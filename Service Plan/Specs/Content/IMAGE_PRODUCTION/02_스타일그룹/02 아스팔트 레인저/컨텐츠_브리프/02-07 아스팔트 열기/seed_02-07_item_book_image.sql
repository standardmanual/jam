-- 02-07 컬렉션(item_books) 대표 이미지 반영: 09번(자외선 차단제 빈 통) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/02-07/empty_sunblock.png?v=1787298405528'
WHERE id = 'bc33de8f-7f87-ee74-1680-c0a09008a04a'; -- 아스팔트 열기
