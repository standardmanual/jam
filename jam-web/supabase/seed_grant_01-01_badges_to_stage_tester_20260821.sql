-- 스테이징 테스트 계정(589132427_stage)에 '무명(無名)을 쫓는 야식가들'(01-01) 컬렉션
-- 아이템 배지 9종 전체 발급 (2026-08-21)
--
-- user_id: 00000000-0000-0000-0000-000000000001 (589132427_stage, dev-tester@jam.local)
-- inventory_id: 11b10fb0-1034-4250-a4d5-161202f87278
-- item_book_id: 7ecbc840-6167-03a3-95b7-acca945951b1 (무명(無名)을 쫓는 야식가들)

insert into inventory_items (inventory_id, badge_id, obtained_by)
select '11b10fb0-1034-4250-a4d5-161202f87278', id, 'system_event'
from badges
where item_book_id = '7ecbc840-6167-03a3-95b7-acca945951b1';

update inventory
set used_slots = used_slots + 9
where id = '11b10fb0-1034-4250-a4d5-161202f87278';
