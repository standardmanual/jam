-- seed_ops_item_copy_sync_20261103.sql 되돌림: 이 SQL이 채운 edited.copy를 지운다.
-- 적용 전에는 대상 항목 어디에도 edited.copy가 없었으므로(적용 전 확인), copy 키를 빼면 원래대로다.
-- 수정본에 남는 키가 없으면 null로 되돌린다. 적용 뒤 사람이 [문안 고치기]로 고친 항목은 그 수정까지 지워지니,
-- 그 경우에는 결정 기록(ops_decisions)의 edit 행을 먼저 확인한다.
do $$
begin
  update ops_bundle_items
     set edited = case when (edited - 'copy') = '{}'::jsonb then null else edited - 'copy' end
   where status in ('scheduled', 'live')
     and kind in ('home_feed_card', 'mission')
     and edited ? 'copy';
end $$;
