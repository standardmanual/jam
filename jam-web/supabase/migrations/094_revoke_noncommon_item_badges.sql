-- 아이템배지(badges.type='item') 중 common을 제외한 모든 등급(rare/legend/mythic)을
-- 소프트 삭제하고, 유저 인벤토리에 이미 발급된 것도 회수한다.
-- 실행 시점 기준: 대상 2700건 중 1449건이 활성 상태였고 나머지 1251건은 이미 소프트
-- 삭제되어 있었음. 인벤토리에 실제 보유 중이던 71건도 함께 제거.
-- 삭제 대상을 재료/결과물로 참조하던 combination_recipes 33건은 is_public=false로 비활성화.

begin;

update badges
set deleted_at = now()
where type = 'item' and rarity <> 'common' and deleted_at is null;

delete from inventory_items
where badge_id in (select id from badges where type = 'item' and rarity <> 'common');

update combination_recipes
set is_public = false
where id in (
  select cr.id
  from combination_recipes cr, (select id from badges where type = 'item' and rarity <> 'common') t
  where t.id = any(cr.ingredient_badge_ids) or cr.result_badge_id = t.id
);

commit;
