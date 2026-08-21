-- 03-01 컬렉션(item_books) 대표 이미지 반영: 04번(새가 쪼아먹은 사과) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-01/bird_pecked_apple.png?v=1787301409215'
WHERE id = '68a6ef7d-8ef3-117b-b25c-1418e1c5d416'; -- 그루터기 살롱의 장물들
