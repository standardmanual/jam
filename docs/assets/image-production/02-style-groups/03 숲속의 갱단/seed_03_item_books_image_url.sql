-- 03 숲속의 갱단 트라이브 10개 컬렉션의 item_books.image_url을
-- 각 컬렉션 1번 아이템의 배지 이미지로 갱신 (컬렉션 대표 이미지 반영, register-badge-images.js 실행 후 수기 실행 기록)
UPDATE item_books
SET image_url = b.image_url
FROM badges b
WHERE item_books.id = b.item_book_id
  AND b.id IN (
    'eef99a08-1b86-4d3a-90ea-36e2634acdb7', -- 03-01 그루터기 살롱의 장물들
    '4cbd1eb3-719e-4c6c-8a92-1606e3fc918f', -- 03-02 공원 벤치의 포식자
    '397235a5-2e5c-48ad-a516-7d6cb0f6217b', -- 03-03 골목길 마피아의 회합
    '60eb9097-8e9f-409f-ab86-4fe5e72e6722', -- 03-04 다람쥐의 월동 준비
    '1cde8f90-74c8-40e5-b925-52da35da0827', -- 03-05 까치의 반짝이는 보물
    '386fcf57-da67-4cda-888e-a5cf934c4a6d', -- 03-06 들개의 은밀한 사냥
    '352ccb6b-ffc6-4071-8ab1-64757a446a37', -- 03-07 도심 숲의 불청객
    '326c362f-fed9-4d2c-83e0-27d6ddd8f68d', -- 03-08 은밀한 밤의 무도회
    'dde83b16-b888-4bae-878c-fee01813679b', -- 03-09 그루터기 살롱의 VIP
    '10a46986-3dd2-47e3-a745-966451651a47'  -- 03-10 겨울잠의 안식처
  );
