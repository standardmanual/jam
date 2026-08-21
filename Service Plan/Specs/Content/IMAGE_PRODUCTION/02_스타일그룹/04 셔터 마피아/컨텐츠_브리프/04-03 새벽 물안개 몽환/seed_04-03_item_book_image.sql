-- 04-03 컬렉션(item_books) 대표 이미지 반영: 01번(이슬 맺힌 렌즈 닦이) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/04-03/dewy_lens_cloth.png?v=1787314518026'
WHERE id = '436bb10f-68c3-4846-158b-fc7d3a62e674'; -- 새벽 물안개 몽환
