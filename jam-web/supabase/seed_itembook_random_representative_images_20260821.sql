-- 컬렉션 대표 이미지 임시 정책 반영 (2026-08-21, 1회성)
--
-- '무명(無名)을 쫓는 야식가들'(01-01)을 제외한 나머지 99개 컬렉션은 아직 실제 배지 이미지가
-- 없어(전부 /badges/sample/... 플레이스홀더) 대표 이미지도 플레이스홀더 상태였다.
-- 이번 1회에 한해, 각 컬렉션 소속 배지 이미지 중 하나를 무작위로 골라 대표 이미지로 반영한다.
--
-- 주의: 이 정책은 이번 실행에만 국한된다 — 향후 실제 배지 이미지를 생성해 등록하는 컬렉션은
-- (01-01처럼) 첫 번째 아이템 이미지를 대표 이미지로 쓰는 기존 규칙을 따른다. 이 스크립트를
-- 재실행할 필요는 없다 (random() 결과는 재현되지 않는다 — 기록 목적으로만 보관).

WITH random_pick AS (
  SELECT DISTINCT ON (item_book_id) item_book_id, image_url
  FROM badges
  WHERE item_book_id IS NOT NULL
    AND deleted_at IS NULL
    AND image_url IS NOT NULL
  ORDER BY item_book_id, random()
)
UPDATE item_books ib
SET image_url = rp.image_url
FROM random_pick rp
WHERE ib.id = rp.item_book_id
  AND ib.id <> '7ecbc840-6167-03a3-95b7-acca945951b1'; -- 무명(無名)을 쫓는 야식가들 제외
