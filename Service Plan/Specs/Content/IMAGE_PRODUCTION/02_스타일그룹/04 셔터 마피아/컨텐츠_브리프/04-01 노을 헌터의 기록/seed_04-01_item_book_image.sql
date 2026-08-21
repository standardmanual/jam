-- 04-01 컬렉션(item_books) 대표 이미지 반영: 03번(노을빛 필름 조각) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/04-01/sunset_film_strip.png?v=1787313856199'
WHERE id = 'ad1a2ef7-4499-0773-f0c8-ba31e96087f2'; -- 노을 헌터의 기록
