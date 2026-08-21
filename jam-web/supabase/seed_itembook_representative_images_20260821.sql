-- 컬렉션(item_books) 대표 이미지 반영 + 오염된 값 복원 (2026-08-21)
--
-- 1) 01-01(무명을 쫓는 야식가들) 대표 이미지를 첫 번째 아이템(매콤달콤 떡볶이) 이미지로 설정.
--    앞으로 배지 등록이 끝난 컬렉션은 첫 번째 아이템 이미지를 대표 이미지로도 반영하는 것을 기본 규칙으로 한다.
UPDATE item_books
SET image_url = 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/01-01/tteokbokki.png'
WHERE id = '7ecbc840-6167-03a3-95b7-acca945951b1'; -- 무명(無名)을 쫓는 야식가들

-- 2) 다른 두 컬렉션(08-03, 08-09)의 image_url이 정상 패턴(상대경로 /itembooks/sample/...)이 아니라
--    절대 URL(https://j-a-m.app/itembooks/sample/...)로 오염되어 있던 것을 발견 — 나머지 97개 행과
--    동일한 상대경로 패턴으로 복원.
UPDATE item_books SET image_url = '/itembooks/sample/b064.png' WHERE id = '1b20a1db-9bbb-f790-572b-a4da8622eb92'; -- 종이 지도의 낭만
UPDATE item_books SET image_url = '/itembooks/sample/b233.png' WHERE id = 'e6399dcb-6a46-48e5-3251-7a1493d5f55d'; -- 헌책방의 냄새
