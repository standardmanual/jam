-- 04-02 컬렉션(item_books) 대표 이미지 반영: 01번(녹아버린 아포가토) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/04-02/melted_affogato.png?v=1787314201663'
WHERE id = '9a9a6ffb-c2dd-2e8c-98f0-e133bf05d99e'; -- 비밀의 카페 탐험
