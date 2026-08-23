-- 20260823: 이미 비활성화된(deleted_at 세팅됨) 아이템배지와 이름은 같지만 등급(rarity)이
-- 다른, 아직 어느 컬렉션(item_book_id)에도 연결되지 않은 채 활성 상태로 남아있던 orphan
-- 배지 1,245건을 함께 비활성화(소프트 삭제)한다.
--
-- 배경: 20260823_004~006 티켓으로 컬렉션 비활성화 → 소속 아이템배지 연쇄 회수 기능이
-- 배포된 뒤, 사용자가 컬렉션 ~46개를 실제로 비활성화했다. 이때 각 컬렉션에 실제로 연결돼
-- 있던 배지(주로 common 등급)만 deleted_at이 세팅됐고, 컨텐츠 제작 과정에서 같은 이름으로
-- 미리 만들어졌지만 실제 컬렉션에 연결되지 않은 채 남아있던 등급 변형(rare/legend/mythic
-- 등, item_book_id IS NULL)은 그대로 활성 상태로 남아 있었다.
--
-- 대상 판정: type='item', deleted_at IS NULL, item_book_id IS NULL이면서, 이미
-- deleted_at이 세팅된 같은 이름·다른 등급의 item 배지가 하나라도 존재하는 배지.
-- (컬렉션 내부 등급 매칭은 0건이었음 — 전량 orphan 배지였다.)
--
-- 물리적 삭제 아님 — deleted_at만 세팅, 원본 행·보유 유저 이력(inventory_items 등)은
-- 그대로 보존. 실행 전 조회 결과: 1,245건 대상, 그중 40건(distinct 유저 5명)이 실제
-- 인벤토리에 보유 중이었음 — 사용자 확인 후 진행.
--
-- 실행 결과: 421 → 1,666 (비활성 item 배지), 1,245건 갱신 확인.

with candidates as (
  select distinct b.id
  from badges b
  join badges x on x.type = 'item'
    and x.deleted_at is not null
    and x.name = b.name
    and x.rarity != b.rarity
  where b.type = 'item'
    and b.deleted_at is null
    and b.item_book_id is null
)
update badges
set deleted_at = now()
where id in (select id from candidates);
