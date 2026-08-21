-- 02-01 컬렉션(item_books) 대표 이미지 반영: 02번(다 식어버린 핫팩) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/02-01/frozen_heatpack.png?v=1787296486075'
WHERE id = 'e9b38bc8-a2fc-9dbf-378d-d22c8f90165b'; -- 블랙 트랙의 생존자
