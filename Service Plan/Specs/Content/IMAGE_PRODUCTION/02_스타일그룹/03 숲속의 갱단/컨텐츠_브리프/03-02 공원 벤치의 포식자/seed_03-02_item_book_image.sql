-- 03-02 컬렉션(item_books) 대표 이미지 반영: 03번(비둘기의 회색 깃털) 배지 이미지 사용
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-02/pigeon_gray_feather.png?v=1787304725122'
WHERE id = '27249944-6e0c-081a-6df2-8b5fd57d31df'; -- 공원 벤치의 포식자
